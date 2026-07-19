"""
Pydantic v2 API Schemas — Request/Response Data Transfer Objects.

All API responses use these schemas (not ORM models directly) to enforce
clean separation between the persistence layer and the API contract.

Schema naming convention:
    *Request  → Incoming request body (POST, PUT)
    *Response → Outgoing response body
    *Summary  → Lightweight list-view schema (excludes nested/heavy fields)

Versioning:
    All endpoints are under /api/v1/. When breaking changes are needed,
    create /api/v2/ with new schema versions in models/schemas_v2.py.

Auto-documentation:
    Field(..., description="...") strings appear verbatim in Swagger UI,
    forming the API contract documentation for frontend developers.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator


# ══════════════════════════════════════════════════════════════════════════════
# Algorithm Result
# ══════════════════════════════════════════════════════════════════════════════

class SubarrayResultSchema(BaseModel):
    """Schema for a single algorithm execution result."""

    algorithm_name: str = Field(..., description="Name of the algorithm that produced this result")
    time_complexity: str = Field(..., description="Big-O time complexity, e.g. 'O(N²)'")
    max_profit:  float = Field(..., description="Maximum achievable profit (sum of best daily changes)")
    buy_index:   int   = Field(..., ge=0, description="Index in prices array at which to BUY")
    sell_index:  int   = Field(..., ge=1, description="Index in prices array at which to SELL")
    buy_price:   Optional[float] = Field(None, description="Actual buy price at buy_index")
    sell_price:  Optional[float] = Field(None, description="Actual sell price at sell_index")
    left_sum:    Optional[float] = Field(None, description="D&C: left sub-problem maximum sum")
    right_sum:   Optional[float] = Field(None, description="D&C: right sub-problem maximum sum")
    cross_sum:   Optional[float] = Field(None, description="D&C: crossing sub-problem maximum sum")

    @model_validator(mode="after")
    def validate_sell_after_buy(self) -> "SubarrayResultSchema":
        if self.sell_index <= self.buy_index:
            raise ValueError(
                f"sell_index ({self.sell_index}) must be > buy_index ({self.buy_index})"
            )
        return self

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
# Benchmark Schemas
# ══════════════════════════════════════════════════════════════════════════════

class BenchmarkStatsSchema(BaseModel):
    """Statistical summary for one algorithm over N benchmark iterations."""

    algorithm_name: str = Field(..., description="Algorithm that was benchmarked")
    time_complexity: str = Field(..., description="Big-O time complexity notation")
    dataset_size: int = Field(..., ge=2, description="Number of price points (N)")
    iterations:   int = Field(..., ge=1, description="Number of iterations executed")

    # Time statistics (seconds)
    mean_time:   float = Field(..., ge=0, description="Mean execution time (seconds)")
    median_time: float = Field(..., ge=0, description="Median execution time (seconds)")
    min_time:    float = Field(..., ge=0, description="Minimum execution time (seconds)")
    max_time:    float = Field(..., ge=0, description="Maximum execution time (seconds)")
    std_time:    float = Field(..., ge=0, description="Standard deviation of execution time (seconds)")

    # Memory statistics (MB) — null when memory_profiler is unavailable
    mean_memory_mb:   Optional[float] = Field(None, description="Mean peak memory delta (MB)")
    median_memory_mb: Optional[float] = Field(None, description="Median peak memory delta (MB)")
    min_memory_mb:    Optional[float] = Field(None, description="Minimum peak memory delta (MB)")
    max_memory_mb:    Optional[float] = Field(None, description="Maximum peak memory delta (MB)")
    std_memory_mb:    Optional[float] = Field(None, description="Standard deviation of memory delta (MB)")

    model_config = {"from_attributes": True}


class FullBenchmarkReportSchema(BaseModel):
    """Complete benchmark report for all algorithms on one dataset."""

    dataset_id:    Optional[int] = Field(None, description="DB ID of the dataset, if persisted")
    dataset_size:  int  = Field(..., description="Number of price points (N)")
    sha256_hash:   str  = Field(..., min_length=64, max_length=64, description="SHA-256 hash of dataset")
    iterations:    int  = Field(..., description="Benchmark iterations per algorithm")
    stats:         dict[str, BenchmarkStatsSchema] = Field(..., description="Per-algorithm statistics")
    verification_passed: bool       = Field(..., description="True if all algorithms agree on max_profit")
    verification_notes:  list[str]  = Field(..., description="Verification detail messages")
    cached:        bool = Field(False, description="True if results were served from cache")


# ══════════════════════════════════════════════════════════════════════════════
# Dataset Schemas
# ══════════════════════════════════════════════════════════════════════════════

class DatasetSummarySchema(BaseModel):
    """Lightweight dataset schema for list views (Dashboard table)."""

    id:                int
    name:              str
    size:              int    = Field(..., description="Number of price points")
    distribution_type: Optional[str]
    source:            str    = Field(..., description="'generated' or 'uploaded'")
    sha256_hash:       str
    min_price:         Optional[float]
    max_price:         Optional[float]
    mean_price:        Optional[float]
    is_verified:       bool
    created_at:        datetime

    model_config = {"from_attributes": True}


class DatasetDetailSchema(DatasetSummarySchema):
    """Full dataset schema including analysis run results."""

    std_price:     Optional[float]
    original_filename: Optional[str]
    analysis_runs: list[SubarrayResultSchema] = []

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
# Experimental Analysis Schemas
# ══════════════════════════════════════════════════════════════════════════════

class ComplexityPointSchema(BaseModel):
    """One data point on the theoretical vs. observed complexity chart."""

    dataset_size:        int
    observed_time:       float
    theoretical_value:   float
    normalized_observed: float
    growth_ratio:        Optional[float] = Field(None, description="Observed ratio (None for first point)")
    theoretical_ratio:   Optional[float] = Field(None, description="Theoretical ratio (None for first point)")
    ratio_deviation:     Optional[float] = Field(None, description="|observed_ratio - theoretical_ratio|")


class GrowthAnalysisSchema(BaseModel):
    """Complete complexity analysis for one algorithm."""

    algorithm_name:     str
    complexity:         str
    points:             list[ComplexityPointSchema]
    mean_growth_ratio:  Optional[float]
    theoretical_mean:   Optional[float]
    fitness_score:      Optional[float] = Field(None, description="[0.0, 1.0] — alignment quality")
    summary:            str


# ══════════════════════════════════════════════════════════════════════════════
# Health Check Schemas
# ══════════════════════════════════════════════════════════════════════════════

class HealthSchema(BaseModel):
    """Health check / liveness probe response."""

    status:                str      = Field(..., description="'healthy' | 'degraded'")
    app:                   str
    version:               str
    database:              str      = Field(..., description="'connected' | 'not_checked' | 'error: ...'")
    registered_algorithms: list[str]
    algorithm_complexities: dict[str, str] = Field(
        default_factory=dict,
        description="Maps algorithm name → Big-O complexity"
    )
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ══════════════════════════════════════════════════════════════════════════════
# Phase 2 — Dataset Generation & Upload Schemas
# ══════════════════════════════════════════════════════════════════════════════

class DistributionType(str, Enum):
    """Supported price distribution patterns for dataset generation."""
    RANDOM          = "random"
    MOSTLY_POSITIVE = "mostly_positive"
    MOSTLY_NEGATIVE = "mostly_negative"
    HIGH_VOLATILITY = "high_volatility"
    LOW_VOLATILITY  = "low_volatility"


class DatasetGenerateRequestSchema(BaseModel):
    """
    Request body for POST /api/v1/datasets/generate.

    Size limits are enforced server-side by the DatasetGenerator service.
    For reproducible datasets, pass a fixed `seed` (None = random).
    """
    name:              str            = Field(..., min_length=1, max_length=255, description="Human-readable dataset name")
    size:              int            = Field(..., ge=1_000, le=1_000_000,        description="Number of price points (1K – 1M)")
    distribution_type: DistributionType = Field(DistributionType.RANDOM,           description="Price distribution pattern")
    start_price:       float          = Field(100.0, gt=0,                         description="Starting price value")
    seed:              Optional[int]  = Field(None,                                description="RNG seed for reproducibility (None = random)")


class DatasetStatsSchema(BaseModel):
    """Descriptive statistics pre-computed on dataset ingest."""
    min_price:  float
    max_price:  float
    mean_price: float
    std_price:  float


class PriceDataSchema(BaseModel):
    """
    Prices returned to the frontend (LTTB-downsampled when original_size > threshold).

    When is_downsampled is True:
        - `prices`  contains only `returned_size` LTTB-selected values.
        - `indices` maps each returned price to its position in the full array.
        - The frontend MUST use `indices` for the x-axis to preserve correct shape.

    When is_downsampled is False:
        - `prices`  contains the complete dataset.
        - `indices` is [0, 1, 2, ..., returned_size-1] (identity mapping).
    """
    prices:        list[float] = Field(..., description="Price values (LTTB-selected or full)")
    indices:       list[int]   = Field(..., description="Original indices in the full dataset")
    is_downsampled: bool       = Field(..., description="True if LTTB was applied")
    original_size:  int        = Field(..., description="Total number of prices in the dataset")
    returned_size:  int        = Field(..., description="Number of prices in this response")


class DatasetCreateResponseSchema(BaseModel):
    """Returned after POST /datasets/generate or POST /datasets/upload."""
    dataset_id:        int
    name:              str
    sha256_hash:       str
    size:              int
    distribution_type: Optional[str]
    source:            str
    stats:             DatasetStatsSchema
    price_data:        PriceDataSchema
    created_at:        datetime
    cached:            bool = Field(False, description="True if dataset already existed in DB")


# ── Upload Validation ────────────────────────────────────────────────────────────

class ValidationWarningSchema(BaseModel):
    """Non-fatal issue detected during file parsing."""
    code:    str
    message: str


class UploadValidationSchema(BaseModel):
    """Upload pre-validation report returned before dataset creation."""
    is_valid:    bool
    total_rows:  int
    valid_rows:  int
    warnings:    list[ValidationWarningSchema]
    price_column_detected: str = Field(..., description="Name of the column used as price series")


# ── Dataset List ────────────────────────────────────────────────────────────────

class DatasetListResponseSchema(BaseModel):
    """Paginated list of datasets for the Dashboard table."""
    total:     int
    page:      int
    page_size: int
    items:     list[DatasetSummarySchema]


# ══════════════════════════════════════════════════════════════════════════════
# Phase 2 — Analysis Schemas
# ══════════════════════════════════════════════════════════════════════════════

class AnalyzeRequestSchema(BaseModel):
    """
    Request body for POST /api/v1/analyze.

    Provide exactly ONE of `dataset_id` (DB-persisted) OR `prices` (inline).
    When using inline prices, results are NOT cached or persisted.
    `algorithms` accepts a subset of registered algorithm names (None = all).

    Inline prices are capped at 100,000 elements (the Divide & Conquer safe
    size limit). For larger datasets, upload via POST /datasets/upload first,
    then reference by dataset_id.
    """
    dataset_id: Optional[int]         = Field(None, description="ID of a persisted dataset")
    prices:     Optional[list[float]] = Field(
        None,
        max_length=100_000,
        description=(
            "Inline price array (not persisted). "
            "Maximum 100,000 elements. Use dataset_id for larger series."
        ),
    )
    algorithms: Optional[list[str]]   = Field(None, description="Algorithms to run (None = all registered)")

    @model_validator(mode="after")
    def validate_source(self) -> "AnalyzeRequestSchema":
        if self.dataset_id is None and self.prices is None:
            raise ValueError("Provide either dataset_id or prices (not both, not neither).")
        if self.dataset_id is not None and self.prices is not None:
            raise ValueError("Provide dataset_id OR prices, not both.")
        if self.prices is not None and len(self.prices) < 2:
            raise ValueError("prices must contain at least 2 elements.")
        return self


class AnalyzeResponseSchema(BaseModel):
    """Returned by POST /api/v1/analyze."""
    dataset_id:          Optional[int]                  = Field(None, description="DB ID if dataset_id was used")
    dataset_size:        int                             = Field(..., description="Number of price points analyzed")
    algorithms_run:      list[str]                      = Field(..., description="Names of algorithms that ran")
    results:             dict[str, SubarrayResultSchema] = Field(..., description="Per-algorithm SubarrayResult")
    verification_passed: bool                            = Field(..., description="True if all agree on max_profit")
    verification_notes:  list[str]                       = Field(...)
    cached:              bool                            = Field(False, description="True if results from DB cache")


# ══════════════════════════════════════════════════════════════════════════════
# Phase 2 — Benchmark Job Schemas
# ══════════════════════════════════════════════════════════════════════════════

class BenchmarkRequestSchema(BaseModel):
    """Request body for POST /api/v1/benchmark."""
    dataset_id: int              = Field(..., description="ID of the persisted dataset to benchmark")
    algorithms: Optional[list[str]] = Field(None, description="Subset of algorithms (None = all registered)")


class BenchmarkJobStatusSchema(BaseModel):
    """
    Returned immediately by POST /api/v1/benchmark and by GET /api/v1/benchmark/{job_id}.

    Poll GET /api/v1/benchmark/{job_id} until status is 'completed' or 'failed'.
    The `report` field is populated only when status == 'completed'.
    """
    job_id:           str
    dataset_id:       int
    dataset_size:     int
    status:           str   = Field(..., description="queued | running | completed | failed")
    progress_message: str   = Field(..., description="Human-readable status description")
    cached:           bool  = Field(False, description="True if results served from DB cache")
    created_at:       datetime
    started_at:       Optional[datetime]  = None
    completed_at:     Optional[datetime]  = None
    report:           Optional[FullBenchmarkReportSchema] = Field(None, description="Populated when status=completed")
    error:            Optional[str]       = Field(None, description="Error message when status=failed")

