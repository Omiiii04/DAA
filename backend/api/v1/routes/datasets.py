"""
Dataset Routes — /api/v1/datasets

Endpoints:
    POST /datasets/generate     — Synthetic log-normal price series generation
    POST /datasets/upload       — CSV / XLSX file upload with validation
    GET  /datasets              — Paginated dataset list (Dashboard table)
    GET  /datasets/{dataset_id} — Dataset detail with analysis run results

Core Behaviors:
    1. SHA-256 content-addressed caching:
       On generate/upload, the price array is hashed. If the hash already
       exists in the DB, the cached dataset is returned immediately.

    2. Price data persistence:
       Prices are saved as numpy .npy files (fast I/O, dtype-preserving).
       The file path is stored in datasets.data_file_path.

    3. LTTB downsampling:
       Responses always include price_data. If original size > downsample_threshold
       (config: 10,000), LTTB reduces the payload to downsample_target (5,000) points.
       Frontend MUST use `price_data.indices` as the x-axis.

    4. Descriptive statistics:
       min/max/mean/std are computed on ingest and stored in the DB.
       Returned in every response to power Dashboard summary cards.
"""

import logging

import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from config import settings
from database.connection import get_db
from database.models import Dataset
from models.schemas import (
    DatasetCreateResponseSchema,
    DatasetDetailSchema,
    DatasetGenerateRequestSchema,
    DatasetListResponseSchema,
    DatasetStatsSchema,
    DatasetSummarySchema,
    PriceDataSchema,
    UploadValidationSchema,
    ValidationWarningSchema,
)
from services.cache_service import CacheService
from services.dataset_generator import dataset_generator
from services.downsampler import lttb_or_passthrough
from services.file_parser import file_parser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/datasets", tags=["Datasets"])

# Maximum upload file size: 50 MB. Files larger than this are rejected with
# HTTP 413 before any parsing takes place, to prevent unbounded memory use.
_MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024  # 50 MB


# ══════════════════════════════════════════════════════════════════════════════
# Helper: Persist prices to .npy and create/update Dataset record
# ══════════════════════════════════════════════════════════════════════════════

def _persist_dataset(
    db: Session,
    prices: np.ndarray,
    name: str,
    distribution_type: str | None,
    source: str,
    original_filename: str | None,
) -> tuple[Dataset, bool]:
    """
    Compute SHA-256, check cache, save file if new, upsert DB record.

    Returns:
        (dataset, cached) — cached=True if the hash already existed in DB.
    """
    sha256 = CacheService.compute_hash(prices)

    # ── Cache check ───────────────────────────────────────────────────────────
    existing = CacheService.find_dataset(db, sha256)
    if existing is not None:
        logger.info("Dataset cache HIT: hash=%s...", sha256[:8])
        return existing, True

    # ── Save prices to .npy file ──────────────────────────────────────────────
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    file_path = settings.data_dir / f"{sha256}.npy"
    np.save(str(file_path), prices)

    # ── Compute descriptive statistics ───────────────────────────────────────
    ds = Dataset(
        name=name,
        sha256_hash=sha256,
        size=len(prices),
        distribution_type=distribution_type,
        source=source,
        original_filename=original_filename,
        data_file_path=str(file_path),
        min_price=float(np.min(prices)),
        max_price=float(np.max(prices)),
        mean_price=float(np.mean(prices)),
        std_price=float(np.std(prices)),
        is_verified=False,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)

    logger.info(
        "Dataset created: id=%d, N=%d, hash=%s...", ds.id, len(prices), sha256[:8]
    )
    return ds, False


def _load_prices(dataset: Dataset) -> np.ndarray:
    """Load prices from the persisted .npy file."""
    if not dataset.data_file_path:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dataset {dataset.id} has no associated price file."
        )
    return np.load(dataset.data_file_path)


def _build_price_data(prices: np.ndarray) -> PriceDataSchema:
    """Apply LTTB if needed and build PriceDataSchema."""
    result = lttb_or_passthrough(prices, threshold=settings.downsample_target)
    return PriceDataSchema(
        prices=result.downsampled_prices.tolist(),
        indices=result.selected_indices.tolist(),
        is_downsampled=result.is_downsampled,
        original_size=result.original_size,
        returned_size=result.returned_size,
    )


def _build_stats(dataset: Dataset) -> DatasetStatsSchema:
    return DatasetStatsSchema(
        min_price=dataset.min_price or 0.0,
        max_price=dataset.max_price or 0.0,
        mean_price=dataset.mean_price or 0.0,
        std_price=dataset.std_price or 0.0,
    )


# ══════════════════════════════════════════════════════════════════════════════
# POST /datasets/generate
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/generate",
    response_model=DatasetCreateResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Generate Synthetic Dataset",
    description=(
        "Generate a synthetic stock price series using Log-Normal Random Walk.\n\n"
        "**Distribution types:**\n"
        "- `random` — Zero drift, moderate volatility (baseline)\n"
        "- `mostly_positive` — Bull market (+0.5% daily drift)\n"
        "- `mostly_negative` — Bear market (-0.5% daily drift)\n"
        "- `high_volatility` — Crypto-like (4.0% daily σ)\n"
        "- `low_volatility` — Bond-like (0.3% daily σ)\n\n"
        "Results are content-addressed: calling generate with the same `seed` "
        "returns a cache-hit on the second call."
    ),
)
def generate_dataset(
    body: DatasetGenerateRequestSchema,
    db: Session = Depends(get_db),
) -> DatasetCreateResponseSchema:
    """Generate and persist a synthetic price dataset."""
    try:
        gen = dataset_generator.generate(
            size=body.size,
            distribution_type=body.distribution_type.value,
            start_price=body.start_price,
            seed=body.seed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    ds, cached = _persist_dataset(
        db=db,
        prices=gen.prices,
        name=body.name,
        distribution_type=body.distribution_type.value,
        source="generated",
        original_filename=None,
    )

    # Load prices from file if cached (ensure we get the stored array)
    prices = gen.prices if not cached else _load_prices(ds)

    return DatasetCreateResponseSchema(
        dataset_id=ds.id,
        name=ds.name,
        sha256_hash=ds.sha256_hash,
        size=ds.size,
        distribution_type=ds.distribution_type,
        source=ds.source,
        stats=_build_stats(ds),
        price_data=_build_price_data(prices),
        created_at=ds.created_at,
        cached=cached,
    )


# ══════════════════════════════════════════════════════════════════════════════
# POST /datasets/upload
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/upload",
    response_model=DatasetCreateResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Upload CSV / XLSX Dataset",
    description=(
        "Upload a CSV or XLSX file containing stock closing prices.\n\n"
        "**Supported column names** (case-insensitive, in priority order):\n"
        "`close`, `adj_close`, `price`, `value`, `open`, `high`, `low`\n\n"
        "If none of these are found and the file has a single column, it is used.\n\n"
        "**File limits:** Max 1,000,000 rows. NaN/Inf values are dropped.\n\n"
        "Content-addressed: uploading the same file twice returns a cache hit."
    ),
)
async def upload_dataset(
    name: str = Query(..., min_length=1, max_length=255, description="Human-readable dataset name"),
    file: UploadFile = File(..., description="CSV or XLSX file"),
    db: Session = Depends(get_db),
) -> DatasetCreateResponseSchema:
    """Upload and parse a CSV / XLSX price file."""
    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"File exceeds the {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit. "
                "Reduce the file size or generate a synthetic dataset instead."
            ),
        )

    try:
        parsed = file_parser.parse(content, file.filename or "upload")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    ds, cached = _persist_dataset(
        db=db,
        prices=parsed.prices,
        name=name,
        distribution_type="uploaded",
        source="uploaded",
        original_filename=parsed.original_filename,
    )

    prices = parsed.prices if not cached else _load_prices(ds)

    response = DatasetCreateResponseSchema(
        dataset_id=ds.id,
        name=ds.name,
        sha256_hash=ds.sha256_hash,
        size=ds.size,
        distribution_type=ds.distribution_type,
        source=ds.source,
        stats=_build_stats(ds),
        price_data=_build_price_data(prices),
        created_at=ds.created_at,
        cached=cached,
    )

    # Embed non-fatal parse warnings in response headers for frontend display
    if parsed.warnings:
        warning_msgs = "; ".join(f"[{w.code}] {w.message}" for w in parsed.warnings)
        logger.warning("Upload warnings for '%s': %s", file.filename, warning_msgs)

    return response


# ══════════════════════════════════════════════════════════════════════════════
# POST /datasets/validate (pre-validation without saving)
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/validate",
    response_model=UploadValidationSchema,
    summary="Validate File Without Saving",
    description=(
        "Validate a CSV/XLSX file and report column detection, row counts, and "
        "warnings WITHOUT persisting any data. Use this before the upload step "
        "to give users a preview of what will be extracted."
    ),
)
async def validate_upload(
    file: UploadFile = File(..., description="CSV or XLSX file to validate"),
) -> UploadValidationSchema:
    """Dry-run file validation — no DB writes."""
    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        return UploadValidationSchema(
            is_valid=False,
            total_rows=0,
            valid_rows=0,
            warnings=[ValidationWarningSchema(
                code="FILE_TOO_LARGE",
                message=(
                    f"File exceeds the {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit "
                    "and cannot be validated."
                ),
            )],
            price_column_detected="N/A",
        )

    try:
        parsed = file_parser.parse(content, file.filename or "upload")
    except ValueError as exc:
        # Return a structured validation failure instead of 422
        return UploadValidationSchema(
            is_valid=False,
            total_rows=0,
            valid_rows=0,
            warnings=[ValidationWarningSchema(code="PARSE_ERROR", message=str(exc))],
            price_column_detected="N/A",
        )

    return UploadValidationSchema(
        is_valid=True,
        total_rows=parsed.total_rows,
        valid_rows=parsed.valid_rows,
        warnings=[
            ValidationWarningSchema(code=w.code, message=w.message)
            for w in parsed.warnings
        ],
        price_column_detected=parsed.column,
    )


# ══════════════════════════════════════════════════════════════════════════════
# GET /datasets
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "",
    response_model=DatasetListResponseSchema,
    summary="List All Datasets",
    description="Paginated list of all datasets ordered by creation date (newest first).",
)
def list_datasets(
    page:      int = Query(1,  ge=1,  description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page (max 100)"),
    db: Session = Depends(get_db),
) -> DatasetListResponseSchema:
    """Return paginated dataset summaries."""
    total = db.query(Dataset).count()
    offset = (page - 1) * page_size

    items = (
        db.query(Dataset)
        .order_by(Dataset.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return DatasetListResponseSchema(
        total=total,
        page=page,
        page_size=page_size,
        items=[DatasetSummarySchema.model_validate(ds) for ds in items],
    )


# ══════════════════════════════════════════════════════════════════════════════
# GET /datasets/{dataset_id}
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/{dataset_id}",
    response_model=DatasetDetailSchema,
    summary="Get Dataset Detail",
    description=(
        "Retrieve full dataset metadata including all analysis run results. "
        "Does NOT return the price array (use GET /datasets/{id}/prices for that)."
    ),
)
def get_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
) -> DatasetDetailSchema:
    """Return dataset detail with embedded analysis runs."""
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if ds is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset {dataset_id} not found."
        )
    return DatasetDetailSchema.model_validate(ds)


# ══════════════════════════════════════════════════════════════════════════════
# GET /datasets/{dataset_id}/prices
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/{dataset_id}/prices",
    response_model=PriceDataSchema,
    summary="Get Dataset Prices",
    description=(
        "Return the price array for a dataset (LTTB-downsampled if N > threshold). "
        "Use this to reload chart data when revisiting an existing dataset."
    ),
)
def get_dataset_prices(
    dataset_id: int,
    db: Session = Depends(get_db),
) -> PriceDataSchema:
    """Return prices (with LTTB) for a dataset."""
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if ds is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset {dataset_id} not found."
        )
    prices = _load_prices(ds)
    return _build_price_data(prices)


# ══════════════════════════════════════════════════════════════════════════════
# DELETE /datasets/{dataset_id}
# ══════════════════════════════════════════════════════════════════════════════

@router.delete(
    "/{dataset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Dataset",
    description=(
        "Delete a dataset and all its analysis runs and benchmark results (cascade). "
        "Also removes the persisted .npy price file."
    ),
)
def delete_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
) -> None:
    """Delete dataset + cascade: analysis_runs, benchmark_results, .npy file."""
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if ds is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset {dataset_id} not found."
        )

    # Remove .npy file if it exists
    import os
    if ds.data_file_path and os.path.exists(ds.data_file_path):
        try:
            os.remove(ds.data_file_path)
            logger.info("Removed price file: %s", ds.data_file_path)
        except OSError as exc:
            logger.warning("Could not remove price file '%s': %s", ds.data_file_path, exc)

    db.delete(ds)
    db.commit()
    logger.info("Deleted dataset id=%d", dataset_id)
