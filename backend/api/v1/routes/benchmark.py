"""
Benchmark Routes — /api/v1/benchmark

Endpoints:
    POST /benchmark             — Start async benchmark background task
    GET  /benchmark/{job_id}    — Poll for status + results
    GET  /benchmark             — List all benchmark jobs
    GET  /algorithms            — List algorithms with complexity + limits

Async Flow:
    1. POST /benchmark receives dataset_id → checks SHA-256 cache.
    2. Cache HIT  → returns COMPLETED status immediately (no background task).
    3. Cache MISS → creates a QUEUED job, launches BackgroundTask, returns job_id.
    4. Background task:
           mark_running() → run_full_benchmark_async() → mark_completed()
           (or mark_failed on exception)
    5. Frontend polls GET /benchmark/{job_id} until status != "running" | "queued".

Result Persistence:
    On completion, BenchmarkResult rows (one per algorithm) are saved to the DB.
    The Dataset.is_verified flag is set if all algorithms agree on max_profit.

Background Task Details:
    FastAPI BackgroundTasks run in the asyncio event loop AFTER the response
    is sent. Since run_full_benchmark_async wraps heavy work in asyncio.to_thread,
    the event loop is never blocked by O(N²) computation.
"""

import logging
from datetime import datetime
from typing import Optional

import numpy as np
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from algorithms.registry import ALGORITHM_REGISTRY
from config import settings
from database.connection import get_db
from database.models import BenchmarkResult, Dataset
from models.schemas import (
    BenchmarkJobStatusSchema,
    BenchmarkRequestSchema,
    BenchmarkStatsSchema,
    FullBenchmarkReportSchema,
)
from services.benchmark_runner import BenchmarkStats, FullBenchmarkReport, benchmark_runner
from services.cache_service import CacheService
from services.job_store import BenchmarkJob, InMemoryJobStore, job_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/benchmark", tags=["Benchmark"])


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _load_prices(dataset: Dataset) -> np.ndarray:
    """Load prices from .npy file. Raises 500 on missing file."""
    if not dataset.data_file_path:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dataset {dataset.id} has no associated price file."
        )
    return np.load(dataset.data_file_path)


def _stats_to_schema(stats: BenchmarkStats) -> BenchmarkStatsSchema:
    """Convert BenchmarkStats (service layer) → BenchmarkStatsSchema (API layer)."""
    algo = ALGORITHM_REGISTRY.get(stats.algorithm_name)
    return BenchmarkStatsSchema(
        algorithm_name=stats.algorithm_name,
        time_complexity=algo.time_complexity,
        dataset_size=stats.dataset_size,
        iterations=stats.iterations,
        mean_time=stats.mean_time,
        median_time=stats.median_time,
        min_time=stats.min_time,
        max_time=stats.max_time,
        std_time=stats.std_time,
        mean_memory_mb=stats.mean_memory_mb,
        median_memory_mb=stats.median_memory_mb,
        min_memory_mb=stats.min_memory_mb,
        max_memory_mb=stats.max_memory_mb,
        std_memory_mb=stats.std_memory_mb,
    )


def _report_to_schema(report: FullBenchmarkReport, dataset_id: int, cached: bool = False) -> FullBenchmarkReportSchema:
    """Convert FullBenchmarkReport (service) → FullBenchmarkReportSchema (API)."""
    return FullBenchmarkReportSchema(
        dataset_id=dataset_id,
        dataset_size=report.dataset_size,
        sha256_hash=report.sha256_hash,
        iterations=report.iterations,
        stats={name: _stats_to_schema(s) for name, s in report.stats.items()},
        verification_passed=report.verification_passed,
        verification_notes=report.verification_notes,
        cached=cached,
    )


def _save_benchmark_results(
    db: Session,
    dataset: Dataset,
    report: FullBenchmarkReport,
) -> None:
    """
    Persist BenchmarkResult rows (one per algorithm) and update is_verified.
    Idempotent: skips algorithms that already have a BenchmarkResult row.
    """
    for algo_name, stats in report.stats.items():
        existing = (
            db.query(BenchmarkResult)
            .filter(
                BenchmarkResult.dataset_id == dataset.id,
                BenchmarkResult.algorithm_name == algo_name,
            )
            .first()
        )
        if existing is not None:
            continue

        db.add(BenchmarkResult(
            dataset_id=dataset.id,
            algorithm_name=algo_name,
            dataset_size=stats.dataset_size,
            iterations=stats.iterations,
            mean_time=stats.mean_time,
            median_time=stats.median_time,
            min_time=stats.min_time,
            max_time=stats.max_time,
            std_time=stats.std_time,
            mean_memory_mb=stats.mean_memory_mb,
            median_memory_mb=stats.median_memory_mb,
            min_memory_mb=stats.min_memory_mb,
            max_memory_mb=stats.max_memory_mb,
            std_memory_mb=stats.std_memory_mb,
        ))

    dataset.is_verified = report.verification_passed
    db.commit()
    logger.info(
        "Saved %d BenchmarkResult row(s) for dataset_id=%d, verified=%s",
        len(report.stats), dataset.id, report.verification_passed
    )


def _job_to_schema(job: BenchmarkJob, report_schema: Optional[FullBenchmarkReportSchema] = None) -> BenchmarkJobStatusSchema:
    """Convert BenchmarkJob (service) → BenchmarkJobStatusSchema (API)."""
    return BenchmarkJobStatusSchema(
        job_id=job.job_id,
        dataset_id=job.dataset_id,
        dataset_size=job.dataset_size,
        status=job.status.value,
        progress_message=job.progress_message,
        cached=job.cached,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        report=report_schema,
        error=job.error,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Background Task Function
# ══════════════════════════════════════════════════════════════════════════════

async def _run_benchmark_background(
    job_id: str,
    prices: np.ndarray,
    sha256_hash: str,
    dataset_id: int,
    algorithm_names: Optional[list[str]],
    db_url: str,
) -> None:
    """
    Async background task — runs benchmark in asyncio.to_thread.

    This coroutine runs in the FastAPI event loop AFTER the HTTP response
    is sent. Heavy O(N²) work is always offloaded via to_thread.

    A fresh DB connection is created inside the task because the original
    request's Session is closed when the response is committed.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from database.models import Dataset as _Dataset

    # ── Mark running ─────────────────────────────────────────────────────────
    await job_store.mark_running(job_id)

    try:
        # ── Run benchmark (CPU-bound → thread pool) ───────────────────────────
        report = await benchmark_runner.run_full_benchmark_async(
            prices, sha256_hash, algorithm_names
        )

        # ── Persist results in a fresh DB session ─────────────────────────────
        engine = create_engine(db_url, connect_args={"check_same_thread": False})
        Session = sessionmaker(bind=engine)
        with Session() as task_db:
            ds = task_db.query(_Dataset).filter(_Dataset.id == dataset_id).first()
            if ds is not None:
                _save_benchmark_results(task_db, ds, report)
        engine.dispose()

        await job_store.mark_completed(job_id, report=report, cached=False)

    except Exception as exc:
        logger.exception("Background benchmark failed for job %s", job_id)
        await job_store.mark_failed(job_id, str(exc))


# ══════════════════════════════════════════════════════════════════════════════
# POST /benchmark
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "",
    response_model=BenchmarkJobStatusSchema,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start Benchmark (Async)",
    description=(
        "Start a 10-iteration benchmark for all (or selected) algorithms on a dataset.\n\n"
        "**Returns immediately** with a `job_id` in `queued` status.\n\n"
        "**Poll** `GET /benchmark/{job_id}` until `status` is `completed` or `failed`.\n\n"
        "**Cache:** If all algorithms have cached BenchmarkResults for this dataset, "
        "the response immediately returns `status=completed` with the cached report.\n\n"
        "**Skipped algorithms:** Algorithms whose `max_safe_input_size` is less than N "
        "are automatically skipped (not an error)."
    ),
)
async def start_benchmark(
    body: BenchmarkRequestSchema,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> BenchmarkJobStatusSchema:
    """Queue an async benchmark job and return the job_id for polling."""

    # ── 1. Load dataset ───────────────────────────────────────────────────────
    ds = db.query(Dataset).filter(Dataset.id == body.dataset_id).first()
    if ds is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset {body.dataset_id} not found."
        )

    # ── 2. Validate algorithm names ───────────────────────────────────────────
    algo_names = body.algorithms or ALGORITHM_REGISTRY.names()
    for name in algo_names:
        if name not in ALGORITHM_REGISTRY:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown algorithm '{name}'. Available: {ALGORITHM_REGISTRY.names()}"
            )

    # ── 3. SHA-256 cache check ────────────────────────────────────────────────
    if CacheService.has_benchmark_cache(db, ds.sha256_hash):
        cached_results = CacheService.get_cached_benchmarks(db, ds.sha256_hash)
        # Build a FullBenchmarkReport from DB rows for the response
        stats_map: dict[str, BenchmarkStats] = {}
        for row in cached_results:
            if row.algorithm_name not in algo_names:
                continue
            algo = ALGORITHM_REGISTRY.get(row.algorithm_name)
            stats_map[row.algorithm_name] = BenchmarkStats(
                algorithm_name=row.algorithm_name,
                dataset_size=row.dataset_size,
                iterations=row.iterations,
                mean_time=row.mean_time,
                median_time=row.median_time,
                min_time=row.min_time,
                max_time=row.max_time,
                std_time=row.std_time,
                mean_memory_mb=row.mean_memory_mb,
                median_memory_mb=row.median_memory_mb,
                min_memory_mb=row.min_memory_mb,
                max_memory_mb=row.max_memory_mb,
                std_memory_mb=row.std_memory_mb,
            )

        cached_report = FullBenchmarkReport(
            dataset_size=ds.size,
            sha256_hash=ds.sha256_hash,
            iterations=settings.benchmark_iterations,
            stats=stats_map,
            verification_passed=ds.is_verified,
            verification_notes=["Results loaded from cache."],
        )

        # Create a synthetic completed job
        job = job_store.create_job(
            dataset_id=ds.id,
            dataset_size=ds.size,
            algorithm_names=algo_names,
        )
        report_schema = _report_to_schema(cached_report, ds.id, cached=True)
        await job_store.mark_completed(job.job_id, report=cached_report, cached=True)
        job = job_store.get_job(job.job_id)
        return _job_to_schema(job, report_schema)

    # ── 4. Create job and load prices ─────────────────────────────────────────
    job = job_store.create_job(
        dataset_id=ds.id,
        dataset_size=ds.size,
        algorithm_names=algo_names,
    )
    prices = _load_prices(ds)

    # ── 5. Launch background task ─────────────────────────────────────────────
    background_tasks.add_task(
        _run_benchmark_background,
        job_id=job.job_id,
        prices=prices,
        sha256_hash=ds.sha256_hash,
        dataset_id=ds.id,
        algorithm_names=algo_names,
        db_url=settings.database_url,
    )

    logger.info(
        "Benchmark job %s queued for dataset_id=%d, N=%d",
        job.job_id, ds.id, ds.size
    )
    return _job_to_schema(job, None)


# ══════════════════════════════════════════════════════════════════════════════
# GET /benchmark/{job_id}
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/{job_id}",
    response_model=BenchmarkJobStatusSchema,
    summary="Poll Benchmark Status",
    description=(
        "Check the status of a benchmark job.\n\n"
        "Poll this endpoint until `status` is `completed` or `failed`.\n\n"
        "When `status == 'completed'`, the `report` field contains the full "
        "benchmark statistics (mean/median/min/max/std for time and memory)."
    ),
)
def get_benchmark_status(job_id: str) -> BenchmarkJobStatusSchema:
    """Return current status (and results when complete) for a benchmark job."""
    job = job_store.get_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Benchmark job '{job_id}' not found. Jobs are not persisted across server restarts."
        )

    report_schema: Optional[FullBenchmarkReportSchema] = None
    if job.report is not None:
        report_schema = _report_to_schema(
            job.report, job.dataset_id, cached=job.cached
        )

    return _job_to_schema(job, report_schema)


# ══════════════════════════════════════════════════════════════════════════════
# GET /benchmark
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "",
    response_model=list[BenchmarkJobStatusSchema],
    summary="List All Benchmark Jobs",
    description="List all in-memory benchmark jobs (newest first). Jobs are lost on server restart.",
)
def list_benchmark_jobs() -> list[BenchmarkJobStatusSchema]:
    """Return all benchmark jobs (no pagination — small academic project)."""
    jobs = list(reversed(job_store.list_jobs()))
    return [_job_to_schema(j) for j in jobs]


# ══════════════════════════════════════════════════════════════════════════════
# GET /algorithms (information endpoint — useful for frontend bootstrapping)
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/algorithms/info",
    summary="List Algorithms with Complexity Info",
    description=(
        "Returns metadata for all registered algorithms: Big-O notation, "
        "space complexity, and the safe dataset size limit."
    ),
    tags=["Algorithms"],
)
def list_algorithms() -> list[dict]:
    """Return algorithm metadata for frontend display."""
    return [
        {
            "name":              name,
            "time_complexity":   algo.time_complexity,
            "space_complexity":  algo.space_complexity,
            "max_safe_input_size": algo.max_safe_input_size,
        }
        for name, algo in ALGORITHM_REGISTRY.all().items()
    ]
