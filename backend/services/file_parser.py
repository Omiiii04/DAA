"""
File Parser Service — CSV & XLSX Stock Price Ingestion.

Validates and extracts a 1D price array from uploaded CSV or XLSX files.

Column Detection Priority (case-insensitive):
    1. 'close' or 'adj_close' or 'adjusted_close'
    2. 'price' or 'value'
    3. 'open' or 'high' or 'low'
    4. Single numeric column (auto-detected)
    5. First numeric column if multiple exist

Validation Rules:
    Fatal (raises ValueError → HTTP 422):
        - Unsupported file extension (.txt, .json, etc.)
        - Empty file / no rows
        - No numeric column detectable
        - Fewer than 2 valid prices after cleaning
        - All prices are identical (zero-variance — no subarray problem exists)

    Warnings (non-fatal, included in ParseResult):
        - NaN/Inf values → dropped (logged as warning)
        - Negative prices → kept with warning
        - Prices > 1,000,000 → kept with warning (possible unit error)
        - More than 1M rows → truncated to 1M with warning
        - File has multiple usable columns → reports which one was chosen

Output:
    ParseResult.prices  → 1D float64 numpy array, cleaned and validated.
    ParseResult.column  → Name of the column that was selected.
    ParseResult.warnings → List of (code, message) non-fatal issues.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
_MAX_ROWS = 1_000_000
_SUPPORTED_EXTENSIONS = {"csv", "xlsx", "xls"}

# Column name priority (checked case-insensitively against dataframe columns)
_PRICE_COLUMN_PRIORITY: list[list[str]] = [
    ["close", "adj_close", "adjusted_close", "adjclose"],  # Highest priority
    ["price", "prices"],
    ["value"],
    ["open"],
    ["high"],
    ["low"],
]


# ══════════════════════════════════════════════════════════════════════════════
# Result Dataclass
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class ParseWarning:
    code:    str
    message: str


@dataclass
class ParseResult:
    """
    Output of FileParser.parse().

    prices:          Clean 1D float64 array (2 ≤ N ≤ 1,000,000).
    column:          Name of the column extracted from the source file.
    total_rows:      Rows in the original file (pre-cleaning).
    warnings:        Non-fatal issues — NaN drops, out-of-range values, etc.
    original_filename: The uploaded filename (for DB storage).
    """
    prices:            np.ndarray
    column:            str
    total_rows:        int
    warnings:          list[ParseWarning] = field(default_factory=list)
    original_filename: str = ""

    @property
    def valid_rows(self) -> int:
        return len(self.prices)


# ══════════════════════════════════════════════════════════════════════════════
# Parser
# ══════════════════════════════════════════════════════════════════════════════

class FileParser:
    """
    Stateless file parser for CSV and XLSX price uploads.
    Thread-safe: no mutable state between calls.
    """

    def parse(self, content: bytes, filename: str) -> ParseResult:
        """
        Parse an uploaded CSV or XLSX file and extract a clean price array.

        Args:
            content:  Raw file bytes from the multipart upload.
            filename: Original filename (used for extension detection).

        Returns:
            ParseResult with validated prices, column name, and warnings.

        Raises:
            ValueError: For fatal validation failures (see module docstring).
        """
        ext = self._get_extension(filename)
        df  = self._read_file(content, ext, filename)
        warnings: list[ParseWarning] = []

        # ── Row limit ─────────────────────────────────────────────────────────
        total_rows = len(df)
        if total_rows > _MAX_ROWS:
            df = df.iloc[:_MAX_ROWS].copy()
            warnings.append(ParseWarning(
                code="ROW_LIMIT_TRUNCATED",
                message=f"File has {total_rows:,} rows; truncated to {_MAX_ROWS:,} (system limit)."
            ))

        # ── Column detection ──────────────────────────────────────────────────
        col = self._detect_price_column(df, filename)
        series = df[col]

        # ── Type coercion ─────────────────────────────────────────────────────
        prices = pd.to_numeric(series, errors="coerce").values.astype(np.float64)

        # ── NaN / Inf cleaning ────────────────────────────────────────────────
        finite_mask = np.isfinite(prices)
        dropped = int(np.sum(~finite_mask))
        if dropped > 0:
            warnings.append(ParseWarning(
                code="NAN_VALUES_DROPPED",
                message=f"{dropped:,} row(s) contained NaN or Inf values and were removed."
            ))
            prices = prices[finite_mask]

        # ── Fatal: too few rows remaining ─────────────────────────────────────
        if len(prices) < 2:
            raise ValueError(
                f"After cleaning, only {len(prices)} valid price(s) remain "
                f"(minimum required: 2). Check for NaN-heavy or empty data."
            )

        # ── Optional warnings ─────────────────────────────────────────────────
        negative_count = int(np.sum(prices < 0))
        if negative_count > 0:
            warnings.append(ParseWarning(
                code="NEGATIVE_PRICES",
                message=f"{negative_count:,} price(s) are negative. Verify your data source."
            ))

        high_count = int(np.sum(prices > 1_000_000))
        if high_count > 0:
            warnings.append(ParseWarning(
                code="VERY_HIGH_PRICES",
                message=(
                    f"{high_count:,} price(s) exceed 1,000,000. "
                    "Possible unit mismatch (e.g., price in paise/cents instead of rupees/dollars)."
                )
            ))

        # ── Fatal: zero variance (degenerate input) ───────────────────────────
        if np.std(prices) == 0.0:
            raise ValueError(
                "All prices are identical — no maximum subarray problem exists. "
                "Please upload a dataset with varying prices."
            )

        # ── Apply global row limit (post-cleaning) ────────────────────────────
        if len(prices) > _MAX_ROWS:
            prices = prices[:_MAX_ROWS]
            warnings.append(ParseWarning(
                code="POST_CLEAN_TRUNCATED",
                message=f"After cleaning, dataset truncated to {_MAX_ROWS:,} rows."
            ))

        logger.info(
            "Parsed '%s': column='%s', rows=%d → %d valid, warnings=%d",
            filename, col, total_rows, len(prices), len(warnings)
        )

        return ParseResult(
            prices=prices,
            column=col,
            total_rows=total_rows,
            warnings=warnings,
            original_filename=filename,
        )

    # ── Private Helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _get_extension(filename: str) -> str:
        """Extract and validate the file extension."""
        if "." not in filename:
            raise ValueError(
                f"File '{filename}' has no extension. "
                f"Supported formats: {', '.join(_SUPPORTED_EXTENSIONS)}"
            )
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext not in _SUPPORTED_EXTENSIONS:
            raise ValueError(
                f"Unsupported file format '.{ext}'. "
                f"Supported: {', '.join(_SUPPORTED_EXTENSIONS)}"
            )
        return ext

    @staticmethod
    def _read_file(content: bytes, ext: str, filename: str) -> pd.DataFrame:
        """Read bytes into a DataFrame using the appropriate pandas reader."""
        buf = io.BytesIO(content)
        try:
            if ext == "csv":
                df = pd.read_csv(buf, low_memory=False)
            elif ext in ("xlsx", "xls"):
                df = pd.read_excel(buf, engine="openpyxl" if ext == "xlsx" else None)
            else:
                raise ValueError(f"Unhandled extension: {ext}")
        except Exception as exc:
            raise ValueError(
                f"Failed to parse '{filename}' as {ext.upper()}: {exc}"
            ) from exc

        if df.empty:
            raise ValueError(f"File '{filename}' is empty or contains no data rows.")
        return df

    @staticmethod
    def _detect_price_column(df: pd.DataFrame, filename: str) -> str:
        """
        Detect the price column by priority, then by numeric heuristic.

        Returns the column name (preserving original case) to use as the price series.
        Raises ValueError if no usable column is found.
        """
        col_lower_map = {c.lower().strip().replace(" ", "_"): c for c in df.columns}

        # ── Priority name matching ────────────────────────────────────────────
        for group in _PRICE_COLUMN_PRIORITY:
            for candidate in group:
                if candidate in col_lower_map:
                    return col_lower_map[candidate]

        # ── Single column fallback ────────────────────────────────────────────
        if len(df.columns) == 1:
            return df.columns[0]

        # ── First purely numeric column fallback ──────────────────────────────
        for col in df.columns:
            if pd.api.types.is_numeric_dtype(df[col]):
                logger.debug(
                    "Auto-detected price column '%s' from '%s' (first numeric).",
                    col, filename
                )
                return col

        raise ValueError(
            f"Cannot detect a price column in '{filename}'. "
            f"Columns found: {list(df.columns)}. "
            "Rename the price column to 'close', 'price', or 'value'."
        )


# ── Module-level singleton ─────────────────────────────────────────────────────
file_parser = FileParser()
