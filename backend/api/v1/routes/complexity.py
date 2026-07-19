"""
Complexity Sweep Routes — Phase 4.

POST /complexity/sweep   — Launch a multi-size benchmark sweep (async background).
GET  /complexity/sweep/{job_id} — Poll sweep progress + partial/final analyses.
GET  /complexity/sweeps  — List all sweep jobs.

These endpoints power the ComplexityView frontend page's "Run Sweep" panel,
which provides real-time progress updates and populates the log-log complexity
chart incrementally as each (size × algorithm) benchmark completes.
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field, field_validator

from services.sweep_service import SWEEP_SERVICE, BF_MAX_SIZE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/complexity", tags=["Complexity Sweep"])

# ── Predefined sweep size options (communicated to the frontend) ──────────────
RECOMMENDED_SIZES = [1_000, 5_000, 10_000, 20_000, 50_000, 100_000]
DEFAULT_ALGORITHMS = ["Brute Force", "Divide & Conquer", "Kadane's Algorithm"]
DISTRIBUTION_OPTIONS = [
    "random", "mostly_positive", "mostly_negative", "high_volatility", "low_volatility"
]


# ══════════════════════════════════════════════════════════════════════════════
# Request / Response Schemas
# ══════════════════════════════════════════════════════════════════════════════

class SweepRequest(BaseModel):
    """Body for POST /complexity/sweep."""
    sizes: list[int] = Field(
        default=RECOMMENDED_SIZES,
        description="Dataset sizes to benchmark.  BF auto-skipped for N > 20,000.",
        min_length=1,
        max_length=20,
    )
    algorithms: list[str] = Field(
        default=DEFAULT_ALGORITHMS,
        description="Algorithm names to include.",
    )
    distribution_type: str = Field(
        default="random",
        description="GBM distribution profile for generated datasets.",
    )
    seed: Optional[int] = Field(
        default=None,
        description="RNG seed for reproducibility.  None = random each run.",
    )

    @field_validator("sizes")
    @classmethod
    def validate_sizes(cls, v: list[int]) -> list[int]:
        for s in v:
            if s < 1_000 or s > 1_000_000:
                raise ValueError(
                    f"Each size must be in [1,000, 1,000,000].  Got {s}."
                )
        return sorted(set(v))   # Deduplicate + sort ascending

    @field_validator("algorithms")
    @classmethod
    def validate_algorithms(cls, v: list[str]) -> list[str]:
        valid = set(DEFAULT_ALGORITHMS)
        for a in v:
            if a not in valid:
                raise ValueError(f"Unknown algorithm '{a}'. Supported: {sorted(valid)}")
        return v

    @field_validator("distribution_type")
    @classmethod
    def validate_distribution(cls, v: str) -> str:
        if v not in DISTRIBUTION_OPTIONS:
            raise ValueError(
                f"distribution_type must be one of {DISTRIBUTION_OPTIONS}, got '{v}'."
            )
        return v


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _serialise_job(job) -> dict:
    """Convert SweepJob to a JSON-serializable dict for API responses."""
    return {
        "job_id":              job.job_id,
        "status":              job.status,
        "progress_pct":        job.progress_pct,
        "completed_steps":     job.completed_steps,
        "total_steps":         job.total_steps,
        "current_description": job.current_description,
        "sizes":               job.sizes,
        "algorithms":          job.algorithms,
        "distribution_type":   job.distribution_type,
        "error":               job.error,
        "analyses":            job.analyses,
        "steps": [
            {
                "size":      s.size,
                "algorithm": s.algorithm,
                "status":    s.status,
                "mean_ms":   round(s.mean_time_s * 1000, 4),
                "error":     s.error,
            }
            for s in job.steps
        ],
    }


# ══════════════════════════════════════════════════════════════════════════════
# POST /complexity/sweep
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/sweep",
    status_code=202,
    summary="Launch Multi-Size Complexity Sweep",
    description=(
        "Generates synthetic GBM datasets at each requested size and benchmarks "
        "all eligible algorithms (Brute Force auto-skipped for N > 20,000). "
        "Returns a job_id immediately; poll GET /complexity/sweep/{job_id} for "
        "progress and partial complexity analyses."
    ),
)
async def start_sweep(
    request: SweepRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Start a complexity sweep in the background."""
    job_id = await SWEEP_SERVICE.create_job(
        sizes=request.sizes,
        algorithms=request.algorithms,
        distribution_type=request.distribution_type,
        seed=request.seed,
    )

    # Run the CPU-bound sweep in a thread pool — keeps FastAPI event loop free
    background_tasks.add_task(
        asyncio.to_thread,
        SWEEP_SERVICE.run_sweep_sync,
        job_id,
        request.seed,
    )

    job = await SWEEP_SERVICE.get_job(job_id)
    total_skipped = sum(1 for s in job.steps if s.status == "skipped")

    logger.info(
        "Sweep %s started: sizes=%s, algos=%s, distribution=%s",
        job_id, request.sizes, request.algorithms, request.distribution_type,
    )

    return {
        "job_id":        job_id,
        "status":        "queued",
        "total_steps":   job.total_steps,
        "skipped_steps": total_skipped,
        "message": (
            f"Sweep queued — {job.total_steps} benchmark(s) across "
            f"{len(request.sizes)} dataset size(s).  "
            f"Poll GET /complexity/sweep/{job_id} for updates."
        ),
        "bf_limit":      BF_MAX_SIZE,
        "poll_url":      f"/api/v1/complexity/sweep/{job_id}",
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET /complexity/sweep/{job_id}
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/sweep/{job_id}",
    summary="Poll Sweep Status",
    description=(
        "Returns real-time progress and partial ExperimentalAnalyzer analyses "
        "for the given sweep job.  Check `status` field: "
        "'queued' | 'running' | 'completed' | 'failed'."
    ),
)
async def get_sweep_status(job_id: str) -> dict:
    """Poll one sweep job by ID."""
    job = await SWEEP_SERVICE.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Sweep job '{job_id}' not found.")
    return _serialise_job(job)


# ══════════════════════════════════════════════════════════════════════════════
# GET /complexity/sweeps
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/sweeps",
    summary="List All Sweep Jobs",
    description="Returns all in-memory sweep jobs, newest first.",
)
async def list_sweeps() -> dict:
    """List all sweep jobs (newest first)."""
    jobs = await SWEEP_SERVICE.list_jobs()
    return {
        "total": len(jobs),
        "jobs": [_serialise_job(j) for j in jobs],
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET /complexity/config
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/config",
    summary="Sweep Configuration Options",
    description="Returns recommended sizes, algorithm names, and distribution options for the frontend UI.",
)
def get_sweep_config() -> dict:
    """Return static configuration options for the sweep UI."""
    return {
        "recommended_sizes":    RECOMMENDED_SIZES,
        "algorithms":           DEFAULT_ALGORITHMS,
        "bf_max_size":          BF_MAX_SIZE,
        "distribution_options": DISTRIBUTION_OPTIONS,
        "default_distribution": "random",
    }
