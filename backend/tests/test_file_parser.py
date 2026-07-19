"""
Unit Tests — FileParser Service.

Tests are organized by file format and validation rule.

CSV Fixtures:
    - Single-column CSV (no header) → auto-detected
    - Multi-column CSV with 'close' column → priority matched
    - CSV with NaN values → dropped with warning
    - CSV with negative prices → warning only (not error)
    - CSV with all identical prices → ValueError (zero variance)
    - CSV with < 2 valid rows → ValueError

XLSX Fixtures:
    - Simple XLSX with 'price' column → parsed correctly

Column Detection:
    - 'close', 'adj_close', 'price', 'value' detected by priority
    - Single numeric column auto-detected
    - Unknown columns → ValueError

Error Cases:
    - Unsupported extension → ValueError
    - Empty file → ValueError
    - Non-numeric content → ValueError (after type coercion)
"""

import io

import numpy as np
import pandas as pd
import pytest

from services.file_parser import FileParser, ParseResult, file_parser


# ══════════════════════════════════════════════════════════════════════════════
# CSV Fixture Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _make_csv(data: dict | list[float], include_header=True) -> bytes:
    """Build CSV bytes from a dict (with headers) or list (single column, no header)."""
    if isinstance(data, list):
        df = pd.DataFrame(data, columns=["price"])
    else:
        df = pd.DataFrame(data)
    return df.to_csv(index=False).encode("utf-8")


def _make_xlsx(data: dict) -> bytes:
    """Build XLSX bytes from a dict of column → values."""
    df = pd.DataFrame(data)
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    return buf.getvalue()


@pytest.fixture(scope="module")
def parser() -> FileParser:
    return FileParser()


# ══════════════════════════════════════════════════════════════════════════════
# CSV Parsing — Column Detection
# ══════════════════════════════════════════════════════════════════════════════

class TestCSVColumnDetection:

    def test_close_column_detected(self, parser):
        csv = _make_csv({"close": [100.0, 101.0, 102.0], "volume": [1000, 2000, 3000]})
        result = parser.parse(csv, "data.csv")
        assert result.column == "close"
        assert len(result.prices) == 3

    def test_adj_close_detected(self, parser):
        csv = _make_csv({"adj_close": [50.0, 51.0, 52.0], "open": [49.0, 50.0, 51.0]})
        result = parser.parse(csv, "data.csv")
        assert result.column == "adj_close"

    def test_price_column_detected(self, parser):
        csv = _make_csv({"price": [200.0, 210.0, 205.0]})
        result = parser.parse(csv, "data.csv")
        assert result.column == "price"

    def test_value_column_detected(self, parser):
        csv = _make_csv({"value": [10.0, 12.0, 11.0], "date": ["2024-01-01", "2024-01-02", "2024-01-03"]})
        result = parser.parse(csv, "data.csv")
        assert result.column == "value"

    def test_single_column_auto_detected(self, parser):
        csv = _make_csv({"mystery_col": [5.0, 6.0, 7.0]})
        result = parser.parse(csv, "data.csv")
        assert result.column == "mystery_col"

    def test_first_numeric_column_fallback(self, parser):
        csv = _make_csv({"col_a": [1.0, 2.0, 3.0], "col_b": [4.0, 5.0, 6.0]})
        result = parser.parse(csv, "data.csv")
        assert result.column == "col_a"

    def test_no_numeric_column_raises(self, parser):
        csv = b"name,city\nAlice,NY\nBob,LA"
        with pytest.raises(ValueError, match="Cannot detect a price column"):
            parser.parse(csv, "data.csv")

    def test_close_has_higher_priority_than_price(self, parser):
        csv = _make_csv({"price": [100.0, 101.0, 102.0], "close": [99.0, 100.0, 101.0]})
        result = parser.parse(csv, "data.csv")
        assert result.column == "close"


# ══════════════════════════════════════════════════════════════════════════════
# CSV Parsing — Price Array Extraction
# ══════════════════════════════════════════════════════════════════════════════

class TestCSVPriceExtraction:

    def test_correct_prices_extracted(self, parser):
        csv = _make_csv({"close": [10.0, 20.0, 30.0, 15.0, 25.0]})
        result = parser.parse(csv, "data.csv")
        np.testing.assert_array_almost_equal(result.prices, [10.0, 20.0, 30.0, 15.0, 25.0])

    def test_prices_are_float64(self, parser):
        csv = _make_csv({"close": [1, 2, 3, 4, 5]})
        result = parser.parse(csv, "data.csv")
        assert result.prices.dtype == np.float64

    def test_total_rows_field(self, parser):
        csv = _make_csv({"close": [1.0, 2.0, 3.0, 4.0, 5.0]})
        result = parser.parse(csv, "data.csv")
        assert result.total_rows == 5

    def test_valid_rows_field(self, parser):
        csv = _make_csv({"close": [1.0, 2.0, 3.0]})
        result = parser.parse(csv, "data.csv")
        assert result.valid_rows == 3

    def test_original_filename_preserved(self, parser):
        csv = _make_csv({"close": [1.0, 2.0, 3.0]})
        result = parser.parse(csv, "mystock.csv")
        assert result.original_filename == "mystock.csv"

    def test_returns_parse_result_instance(self, parser):
        csv = _make_csv({"close": [10.0, 20.0]})
        result = parser.parse(csv, "data.csv")
        assert isinstance(result, ParseResult)


# ══════════════════════════════════════════════════════════════════════════════
# CSV Parsing — NaN / Inf Cleaning
# ══════════════════════════════════════════════════════════════════════════════

class TestNaNInfCleaning:

    def test_nan_values_dropped(self, parser):
        csv = b"close\n100.0\n\n102.0\n103.0"  # Empty row → NaN
        result = parser.parse(csv, "data.csv")
        assert len(result.prices) < 4  # At least one row dropped
        assert np.all(np.isfinite(result.prices))

    def test_nan_warning_generated(self, parser):
        csv = b"close\n100.0\n\n102.0"
        result = parser.parse(csv, "data.csv")
        codes = [w.code for w in result.warnings]
        assert "NAN_VALUES_DROPPED" in codes

    def test_all_nan_raises_after_cleaning(self, parser):
        csv = b"close\n\n\n"  # All NaN
        with pytest.raises(ValueError, match="After cleaning"):
            parser.parse(csv, "data.csv")


# ══════════════════════════════════════════════════════════════════════════════
# CSV Parsing — Warnings (Non-Fatal)
# ══════════════════════════════════════════════════════════════════════════════

class TestWarnings:

    def test_negative_prices_generate_warning(self, parser):
        csv = _make_csv({"close": [-5.0, -3.0, 1.0, 2.0]})
        result = parser.parse(csv, "data.csv")
        codes = [w.code for w in result.warnings]
        assert "NEGATIVE_PRICES" in codes
        # Prices are NOT removed — warning only
        assert len(result.prices) == 4

    def test_very_high_prices_generate_warning(self, parser):
        csv = _make_csv({"close": [1_000_001.0, 1_000_002.0, 5.0]})
        result = parser.parse(csv, "data.csv")
        codes = [w.code for w in result.warnings]
        assert "VERY_HIGH_PRICES" in codes

    def test_no_warnings_for_clean_data(self, parser):
        csv = _make_csv({"close": [100.0, 101.0, 99.0, 102.0, 98.0]})
        result = parser.parse(csv, "data.csv")
        assert result.warnings == []


# ══════════════════════════════════════════════════════════════════════════════
# CSV Parsing — Fatal Validation
# ══════════════════════════════════════════════════════════════════════════════

class TestFatalValidation:

    def test_zero_variance_raises(self, parser):
        csv = _make_csv({"close": [100.0, 100.0, 100.0, 100.0, 100.0]})
        with pytest.raises(ValueError, match="identical"):
            parser.parse(csv, "data.csv")

    def test_single_row_after_clean_raises(self, parser):
        # Only one valid price row
        csv = b"close\n100.0"
        with pytest.raises(ValueError):
            parser.parse(csv, "data.csv")

    def test_empty_file_raises(self, parser):
        with pytest.raises(ValueError):
            parser.parse(b"", "data.csv")

    def test_unsupported_extension_raises(self, parser):
        with pytest.raises(ValueError, match="Unsupported file format"):
            parser.parse(b"data", "data.txt")

    def test_no_extension_raises(self, parser):
        with pytest.raises(ValueError, match="no extension"):
            parser.parse(b"data", "datafile")


# ══════════════════════════════════════════════════════════════════════════════
# XLSX Parsing
# ══════════════════════════════════════════════════════════════════════════════

class TestXLSXParsing:

    def test_xlsx_price_column_extracted(self, parser):
        xlsx = _make_xlsx({"price": [10.0, 20.0, 15.0, 25.0, 18.0]})
        result = parser.parse(xlsx, "data.xlsx")
        assert len(result.prices) == 5
        np.testing.assert_array_almost_equal(result.prices, [10.0, 20.0, 15.0, 25.0, 18.0])

    def test_xlsx_close_column_detected(self, parser):
        xlsx = _make_xlsx({"close": [50.0, 55.0, 52.0], "volume": [1000, 2000, 1500]})
        result = parser.parse(xlsx, "data.xlsx")
        assert result.column == "close"

    def test_xlsx_returns_float64(self, parser):
        xlsx = _make_xlsx({"close": [1.0, 2.0, 3.0]})
        result = parser.parse(xlsx, "data.xlsx")
        assert result.prices.dtype == np.float64

    def test_module_level_singleton_works(self):
        csv = _make_csv({"close": [1.0, 2.0, 3.0, 2.5]})
        result = file_parser.parse(csv, "data.csv")
        assert isinstance(result, ParseResult)
