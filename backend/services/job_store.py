"""
In-Memory Benchmark Job Store.

Tracks the lifecycle of asynchronous benchmark background tasks.
Provides a thread-safe (asyncio) store with no external dependency (no Redis).

Job Lifecycle:
    QUEUED → RUNNING → COMPLETED
                    ↘ FAILED

State Transitions:
    POST /benchmark       → creates job in QUEUED state
    Background task start → transitions to RUNNING
    benchmark completes   → transitions to COMPLETED with report
    exception raised      → transitions to FAILED with error message

Thread-Safety:
    All state mutations are protected by asyncio.Lock().
    Read operations (get_job) are unprotected (Python GIL is sufficient
    for simple dict reads in CPython).

Production Note:
    For multi-process or multi-worker deployments, replace this module
    with a Redis-backed store. The interface contract (create, update,
    get, list) is identical — only the backend changes.

Retention Policy:
    Jobs are kept in memory indefinitely for this academic application.
    In production, add a cleanup task that removes jobs older than 24 hours.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# Job Status Enum
# ══════════════════════════════════════════════════════════════════════════════

class JobStatus(str, Enum):
    QUEUED    = "queued"
    RUNNING   = "running"
    COMPLETED = "completed"
    FAILED    = "failed"


# ══════════════════════════════════════════════════════════════════════════════
# Job Dataclass
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class BenchmarkJob:
    """
    Represents a single benchmark background task.

    The `report` field is populated only when status == COMPLETED.
    The `error` field is populated only when status == FAILED.
    """
    job_id:           str
    dataset_id:       int
    dataset_size:     int
    algorithm_names:  Optional[list[str]]            # None = all algorithms
    status:           JobStatus    = JobStatus.QUEUED
    progress_message: str          = "Benchmark queued — waiting for worker thread."
    cached:           bool         = False
    report:           Optional[Any] = None             # FullBenchmarkReport at runtime
    error:            Optional[str] = None
    created_at:       datetime     = field(default_factory=datetime.utcnow)
    started_at:       Optional[datetime] = None
    completed_at:     Optional[datetime] = None

    def to_dict(self) -> dict:
        """Serialize to dict (used by Pydantic schema via from_attributes)."""
        return {
            "job_id":            self.job_id,
            "dataset_id":        self.dataset_id,
            "dataset_size":      self.dataset_size,
            "status":            self.status.value,
            "progress_message":  self.progress_message,
            "cached":            self.cached,
            "report":            self.report,
            "error":             self.error,
            "created_at":        self.created_at,
            "started_at":        self.started_at,
            "completed_at":      self.completed_at,
        }


# ══════════════════════════════════════════════════════════════════════════════
# Job Store
# ══════════════════════════════════════════════════════════════════════════════

class InMemoryJobStore:
    """
    Thread-safe asyncio in-memory benchmark job store.

    All mutating methods are async and use asyncio.Lock().
    Read methods are synchronous — safe for FastAPI dependency injection.
    """

    def __init__(self) -> None:
        self._jobs: dict[str, BenchmarkJob] = {}
        self._lock = asyncio.Lock()

    # ── Creation ──────────────────────────────────────────────────────────────

    def create_job(
        self,
        dataset_id: int,
        dataset_size: int,
        algorithm_names: Optional[list[str]] = None,
    ) -> BenchmarkJob:
        """
        Create a new job in QUEUED state.

        Synchronous: intended to be called before the background task starts.
        The job_id is a UUID4 string.
        """
        job_id = str(uuid.uuid4())
        job = BenchmarkJob(
            job_id=job_id,
            dataset_id=dataset_id,
            dataset_size=dataset_size,
            algorithm_names=algorithm_names,
        )
        self._jobs[job_id] = job
        logger.info("Created benchmark job %s (dataset_id=%d, N=%d)", job_id, dataset_id, dataset_size)
        return job

    # ── Reads ─────────────────────────────────────────────────────────────────

    def get_job(self, job_id: str) -> Optional[BenchmarkJob]:
        """Return the job, or None if job_id is unknown."""
        return self._jobs.get(job_id)

    def list_jobs(self) -> list[BenchmarkJob]:
        """Return all jobs in insertion order (newest last)."""
        return list(self._jobs.values())

    def __len__(self) -> int:
        return len(self._jobs)

    # ── State Transitions (async) ─────────────────────────────────────────────

    async def mark_running(self, job_id: str) -> None:
        """Transition job from QUEUED → RUNNING."""
        async with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].status = JobStatus.RUNNING
                self._jobs[job_id].started_at = datetime.utcnow()
                self._jobs[job_id].progress_message = (
                    "Running benchmark iterations… this may take several seconds."
                )
        logger.debug("Job %s → RUNNING", job_id)

    async def mark_completed(self, job_id: str, report: Any, cached: bool = False) -> None:
        """Transition job to COMPLETED and store the FullBenchmarkReport."""
        async with self._lock:
            if job_id in self._jobs:
                job = self._jobs[job_id]
                job.status           = JobStatus.COMPLETED
                job.report           = report
                job.cached           = cached
                job.completed_at     = datetime.utcnow()
                job.progress_message = "Benchmark complete."
        logger.info("Job %s → COMPLETED (cached=%s)", job_id, cached)

    async def mark_failed(self, job_id: str, error: str) -> None:
        """Transition job to FAILED and store the error message."""
        async with self._lock:
            if job_id in self._jobs:
                job = self._jobs[job_id]
                job.status           = JobStatus.FAILED
                job.error            = error
                job.completed_at     = datetime.utcnow()
                job.progress_message = f"Benchmark failed: {error}"
        logger.error("Job %s → FAILED: %s", job_id, error)


# ── Module-level singleton ─────────────────────────────────────────────────────
job_store = InMemoryJobStore()
