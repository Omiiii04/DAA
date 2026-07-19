"""
SQLAlchemy ORM Models — Database Table Definitions.

Schema Design:
    datasets         Stores each price dataset with a SHA-256 hash for O(1)
                     cache lookup. One row = one distinct dataset.

    analysis_runs    Records the result of running one algorithm on one dataset.
                     One dataset → up to 3 analysis_runs (one per algorithm).

    benchmark_results Stores the 10-iteration statistical summary (mean/median/
                     min/max/std) for time and memory. One row per algorithm
                     per dataset run.

Cascade Behavior:
    Deleting a Dataset automatically deletes all its AnalysisRuns and
    BenchmarkResults (cascade="all, delete-orphan"). This prevents orphaned rows.

Indexing Strategy:
    - sha256_hash on datasets: unique + index → O(1) cache lookup.
    - Composite index (dataset_id, algorithm_name) on runs/benchmarks:
      fast lookup of "all results for dataset X by algorithm Y".
"""

from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Index, Integer, String, Text,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Modern SQLAlchemy 2.0+ declarative base."""
    pass


# ══════════════════════════════════════════════════════════════════════════════
# datasets
# ══════════════════════════════════════════════════════════════════════════════

class Dataset(Base):
    """
    Represents a stock price dataset (generated or uploaded).

    SHA-256 hash provides content-addressed caching:
        - Two identical datasets (regardless of source) share one row.
        - Any single-price change produces a completely different hash.
        - Hash lookup is O(1) via the unique index.

    Descriptive statistics (min/max/mean/std) are pre-computed on ingest
    and stored here to power the Dashboard summary cards (Phase 3).
    """
    __tablename__ = "datasets"

    id   = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    sha256_hash = Column(String(64), unique=True, nullable=False, index=True)
    size = Column(Integer, nullable=False)                         # N: number of price points
    distribution_type = Column(String(50), nullable=True)          # 'random', 'mostly_positive', etc.
    source = Column(String(20), nullable=False, default="generated")  # 'generated' | 'uploaded'
    original_filename = Column(String(255), nullable=True)         # Original upload filename
    data_file_path = Column(Text, nullable=True)                   # Persisted data file path

    # ── Descriptive statistics (computed on ingest, Phase 2) ─────────────────
    min_price  = Column(Float, nullable=True)
    max_price  = Column(Float, nullable=True)
    mean_price = Column(Float, nullable=True)
    std_price  = Column(Float, nullable=True)

    # ── Verification flag ─────────────────────────────────────────────────────
    # Set True when all 3 algorithms agree on max_profit (within 1e-6 tolerance)
    is_verified = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    analysis_runs = relationship(
        "AnalysisRun",
        back_populates="dataset",
        cascade="all, delete-orphan",
        lazy="select",
    )
    benchmark_results = relationship(
        "BenchmarkResult",
        back_populates="dataset",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"Dataset(id={self.id}, name={self.name!r}, "
            f"size={self.size}, hash={self.sha256_hash[:8]}...)"
        )


# ══════════════════════════════════════════════════════════════════════════════
# analysis_runs
# ══════════════════════════════════════════════════════════════════════════════

class AnalysisRun(Base):
    """
    Records the output of ONE algorithm execution on ONE dataset.

    Relationship: Dataset (1) ←→ (N) AnalysisRuns
    Typically 3 rows per dataset: one for each algorithm.

    Index Mapping:
        buy_index  / sell_index refer to positions in the PRICES array.
        buy_price  / sell_price are the actual price values at those positions,
        stored for convenience so the API doesn't need to re-load raw data.

    D&C-Specific Fields:
        subarray_type: 'left' | 'right' | 'crossing'
        left_sum / right_sum / cross_sum: sub-problem sums from the recursive
        call — used by the Phase 5 step-by-step visualizer.
    """
    __tablename__ = "analysis_runs"
    __table_args__ = (
        Index("ix_analysis_runs_dataset_algo", "dataset_id", "algorithm_name"),
    )

    id           = Column(Integer, primary_key=True, index=True, autoincrement=True)
    dataset_id   = Column(Integer, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    algorithm_name = Column(String(50), nullable=False)

    # ── Result fields ─────────────────────────────────────────────────────────
    max_profit   = Column(Float, nullable=False)
    buy_index    = Column(Integer, nullable=False)
    sell_index   = Column(Integer, nullable=False)
    buy_price    = Column(Float, nullable=True)
    sell_price   = Column(Float, nullable=True)

    # ── Divide & Conquer metadata (Phase 5 visualizer) ────────────────────────
    subarray_type = Column(String(20), nullable=True)   # 'left' | 'right' | 'crossing'
    left_sum      = Column(Float, nullable=True)
    right_sum     = Column(Float, nullable=True)
    cross_sum     = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    dataset = relationship("Dataset", back_populates="analysis_runs")

    def __repr__(self) -> str:
        return (
            f"AnalysisRun(algo={self.algorithm_name!r}, "
            f"profit={self.max_profit:.4f}, "
            f"buy={self.buy_index}, sell={self.sell_index})"
        )


# ══════════════════════════════════════════════════════════════════════════════
# benchmark_results
# ══════════════════════════════════════════════════════════════════════════════

class BenchmarkResult(Base):
    """
    Stores the 10-iteration statistical summary for one algorithm on one dataset.

    Statistics computed:
        Mean, Median, Min, Max, Standard Deviation

    Metrics stored:
        Execution time (seconds) — measured with time.perf_counter()
        Peak memory delta (MB)   — measured with memory_profiler

    These rows populate the Phase 4 Bar Charts and Phase 5 PDF Report.
    """
    __tablename__ = "benchmark_results"
    __table_args__ = (
        Index("ix_benchmark_results_dataset_algo", "dataset_id", "algorithm_name"),
    )

    id           = Column(Integer, primary_key=True, index=True, autoincrement=True)
    dataset_id   = Column(Integer, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    algorithm_name = Column(String(50), nullable=False)
    dataset_size = Column(Integer, nullable=False)    # N at time of benchmark
    iterations   = Column(Integer, default=10, nullable=False)

    # ── Time Statistics (seconds) ─────────────────────────────────────────────
    mean_time   = Column(Float, nullable=False)
    median_time = Column(Float, nullable=False)
    min_time    = Column(Float, nullable=False)
    max_time    = Column(Float, nullable=False)
    std_time    = Column(Float, nullable=False)

    # ── Memory Statistics (MB) ────────────────────────────────────────────────
    # NULL when memory_profiler is not installed (graceful fallback)
    mean_memory_mb   = Column(Float, nullable=True)
    median_memory_mb = Column(Float, nullable=True)
    min_memory_mb    = Column(Float, nullable=True)
    max_memory_mb    = Column(Float, nullable=True)
    std_memory_mb    = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    dataset = relationship("Dataset", back_populates="benchmark_results")

    def __repr__(self) -> str:
        return (
            f"BenchmarkResult(algo={self.algorithm_name!r}, "
            f"N={self.dataset_size}, "
            f"mean={self.mean_time:.6f}s)"
        )


# ══════════════════════════════════════════════════════════════════════════════
# ml_training_jobs  (Phase 6)
# ══════════════════════════════════════════════════════════════════════════════

class MLTrainingJob(Base):
    """
    Records one ML model training run (Phase 6).

    dataset_id is stored as a plain integer (no FK) so that sweep-generated
    transient datasets and regular datasets are both supported without cascade
    side-effects.

    Fields:
        model_name     : Registry key (e.g., "anomaly_detector")
        status         : queued → running → completed | failed
        hyperparams    : JSON-serialized user-supplied hyperparameters
        metrics        : JSON-serialized training metrics (accuracy, silhouette…)
        summary        : Human-readable one-paragraph result description
        sample_json    : JSON-serialized downsampled predictions for visualization
        model_path     : Absolute path to joblib-serialized artifact (.pkl)
        error_message  : Error string if status == 'failed'
    """
    __tablename__ = "ml_training_jobs"

    id             = Column(Integer, primary_key=True, index=True, autoincrement=True)
    dataset_id     = Column(Integer, nullable=True)     # Plain int — no FK
    model_name     = Column(String(100), nullable=False)
    status         = Column(String(20),  default="queued", nullable=False)
    hyperparams    = Column(Text, nullable=True)         # JSON
    metrics        = Column(Text, nullable=True)         # JSON
    summary        = Column(Text, nullable=True)
    sample_json    = Column(Text, nullable=True)         # Downsampled predictions JSON
    model_path     = Column(String(500), nullable=True)  # Path to .pkl artifact
    error_message  = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at   = Column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return (
            f"MLTrainingJob(id={self.id}, model={self.model_name!r}, "
            f"status={self.status!r}, dataset_id={self.dataset_id})"
        )

