"""
Complexity Sweep Service — Phase 4.

Orchestrates an automated multi-size benchmark sweep for empirical
complexity analysis.  For each requested dataset size, generates a fresh
GBM price series, saves a transient Dataset record, runs all eligible
algorithms (Brute Force skipped when N > BF_MAX_SIZE), stores BenchmarkResult
rows, and incrementally updates ExperimentalAnalyzer fitness data.

Thread Safety:
    SweepService is a singleton with an asyncio.Lock protecting the in-memory
    job store.  The heavy benchmark work runs in asyncio.to_thread() — the
    same pattern used by the Phase 2 BenchmarkRunner — so the FastAPI event
    loop stays responsive even during O(N²) sweeps.

Job Lifecycle:
    QUEUED → RUNNING → COMPLETED | FAILED
    (Partial results are available in job.analyses while status == RUNNING.)
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import statistics
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from algorithms.registry import ALGORITHM_REGISTRY
from database.models import BenchmarkResult, Dataset
from services.benchmark_runner import benchmark_runner
from services.dataset_generator import dataset_generator
from services.experimental_analysis import experimental_analyzer

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
BF_MAX_SIZE  = 20_000   # Mirrors AlgorithmStrategy.max_safe_input_size for BF
ITERATIONS   = 10       # Matches settings.benchmark_iterations

_ALGO_COMPLEXITY: dict[str, str] = {
    "Brute Force":          "O(N²)",
    "Divide & Conquer":     "O(N log N)",
    "Kadane's Algorithm":   "O(N)",
}

_ALGO_COLOR: dict[str, str] = {
    "Brute Force":          "#ef4444",
    "Divide & Conquer":     "#f59e0b",
    "Kadane's Algorithm":   "#10b981",
}


# ══════════════════════════════════════════════════════════════════════════════
# Data Classes
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class SweepStep:
    """One (size × algorithm) cell in the sweep matrix."""
    size:       int
    algorithm:  str
    status:     str = "pending"   # pending | running | done | skipped | error
    mean_time_s: float = 0.0
    error:      Optional[str] = None


@dataclass
class SweepJob:
    """In-memory job record for one sweep run."""
    job_id:              str
    sizes:               list[int]
    algorithms:          list[str]
    distribution_type:   str
    status:              str       = "queued"
    steps:               list[SweepStep] = field(default_factory=list)
    completed_steps:     int       = 0
    total_steps:         int       = 0
    current_description: str       = ""
    analyses:            dict      = field(default_factory=dict)
    error:               Optional[str] = None

    @property
    def progress_pct(self) -> float:
        if self.total_steps == 0:
            return 0.0
        return round(self.completed_steps / self.total_steps * 100, 1)


# ══════════════════════════════════════════════════════════════════════════════
# Service
# ══════════════════════════════════════════════════════════════════════════════

class SweepService:
    """
    Manages sweep job lifecycle and executes multi-size benchmarks.

    The singleton instance SWEEP_SERVICE is shared across all requests.
    """

    def __init__(self) -> None:
        self._jobs: dict[str, SweepJob] = {}
        self._lock = asyncio.Lock()

    # ── Public Async API ──────────────────────────────────────────────────────

    async def create_job(
        self,
        sizes: list[int],
        algorithms: list[str],
        distribution_type: str,
        seed: Optional[int],
    ) -> str:
        """Create a new sweep job and return its job_id."""
        job_id = f"sweep-{uuid.uuid4().hex[:10]}"

        steps: list[SweepStep] = []
        for sz in sorted(sizes):
            for algo in algorithms:
                if algo == "Brute Force" and sz > BF_MAX_SIZE:
                    steps.append(SweepStep(size=sz, algorithm=algo, status="skipped"))
                else:
                    steps.append(SweepStep(size=sz, algorithm=algo))

        active_steps = sum(1 for s in steps if s.status != "skipped")

        job = SweepJob(
            job_id=job_id,
            sizes=sorted(sizes),
            algorithms=algorithms,
            distribution_type=distribution_type,
            steps=steps,
            total_steps=active_steps,
        )

        async with self._lock:
            self._jobs[job_id] = job

        return job_id

    async def get_job(self, job_id: str) -> Optional[SweepJob]:
        """Retrieve a job by ID (returns None if not found)."""
        async with self._lock:
            return self._jobs.get(job_id)

    async def list_jobs(self) -> list[SweepJob]:
        """Return all jobs, newest first (by job_id alphabetical proxy)."""
        async with self._lock:
            return sorted(self._jobs.values(), key=lambda j: j.job_id, reverse=True)

    # ── Synchronous Sweep Execution (runs in asyncio.to_thread) ─────────────

    def run_sweep_sync(
        self,
        job_id: str,
        seed: Optional[int],
    ) -> None:
        """
        Execute the full sweep synchronously.

        IMPORTANT: Must be called via asyncio.to_thread() — never directly
        from an async context, as it performs blocking CPU and I/O work.

        Opens its own SQLAlchemy session (background-task-safe pattern from
        Phase 2 BenchmarkRunner design).
        """
        from database.connection import SessionLocal

        db = SessionLocal()
        job = self._jobs[job_id]   # Direct dict access — no asyncio lock needed in thread
        job.status = "running"

        try:
            for size in job.sizes:
                # ── Step 1: Generate GBM dataset ──────────────────────────────
                job.current_description = f"Generating GBM dataset — N={size:,} ({job.distribution_type})…"
                logger.info("[Sweep %s] Generating N=%d (%s)", job_id, size, job.distribution_type)

                import hashlib as _hashlib
                generated = dataset_generator.generate(
                    size=size,
                    distribution_type=job.distribution_type,
                    start_price=100.0,
                    seed=seed,
                )
                prices = generated.prices

                # ── Persist a transient Dataset row (FK requirement) ──────────
                sha = _hashlib.sha256(prices.tobytes()).hexdigest()
                # Reuse existing row if same hash already exists
                existing_ds = db.query(Dataset).filter(Dataset.sha256_hash == sha).first()
                if existing_ds:
                    ds_id = existing_ds.id
                else:
                    ds_row = Dataset(
                        name=f"[Sweep] {job.distribution_type} N={size:,}",
                        size=size,
                        distribution_type=job.distribution_type,
                        source="generated",
                        sha256_hash=sha,
                        file_path="",          # No .npy file for sweep datasets
                        is_verified=False,
                        min_price=float(generated.min_price),
                        max_price=float(generated.max_price),
                        mean_price=float(generated.mean_price),
                    )
                    db.add(ds_row)
                    db.flush()               # Assigns ds_row.id without full commit
                    ds_id = ds_row.id

                # ── Step 2: Benchmark each algorithm ──────────────────────────
                for algo_name in job.algorithms:
                    step = next(
                        (s for s in job.steps if s.size == size and s.algorithm == algo_name),
                        None,
                    )
                    if step is None or step.status == "skipped":
                        continue

                    step.status = "running"
                    job.current_description = (
                        f"Benchmarking N={size:,} — {algo_name} ({ITERATIONS} iters)…"
                    )
                    logger.info(
                        "[Sweep %s] Benchmarking N=%d with '%s'",
                        job_id, size, algo_name,
                    )

                    try:
                        algo = ALGORITHM_REGISTRY.get(algo_name)
                        stats = benchmark_runner.benchmark_algorithm(algo, prices)

                        # ── Persist BenchmarkResult ───────────────────────────
                        br = BenchmarkResult(
                            dataset_id=ds_id,
                            algorithm_name=algo_name,
                            dataset_size=size,
                            iterations=ITERATIONS,
                            mean_time=stats.mean_time,
                            median_time=stats.median_time,
                            min_time=stats.min_time,
                            max_time=stats.max_time,
                            std_time=stats.std_time,
                            mean_memory_mb=stats.mean_memory_mb or 0.0,
                        )
                        db.add(br)
                        db.commit()

                        step.mean_time_s = stats.mean_time
                        step.status = "done"

                    except Exception as exc:
                        logger.warning(
                            "[Sweep %s] Error benchmarking %s @ N=%d: %s",
                            job_id, algo_name, size, exc,
                        )
                        step.status = "error"
                        step.error  = str(exc)
                        db.rollback()

                    job.completed_steps += 1

                # ── Step 3: Update partial ExperimentalAnalyzer results ───────
                self._recompute_analyses(job)

            job.status = "completed"
            job.current_description = f"Sweep complete — {job.completed_steps} benchmarks run."

        except Exception as exc:
            logger.error("[Sweep %s] Fatal error: %s", job_id, exc, exc_info=True)
            job.status = "failed"
            job.error  = str(exc)
        finally:
            db.close()

    # ── Private Helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _recompute_analyses(job: SweepJob) -> None:
        """
        Incrementally update ExperimentalAnalyzer fitness data as steps complete.
        Called after every size column to provide partial real-time updates.
        """
        by_algo: dict[str, dict[int, float]] = {}
        for step in job.steps:
            if step.status == "done":
                by_algo.setdefault(step.algorithm, {})[step.size] = step.mean_time_s

        analyses: dict = {}
        for algo_name, size_time_map in by_algo.items():
            if len(size_time_map) < 2:
                continue
            complexity = _ALGO_COMPLEXITY.get(algo_name, "O(N)")
            sizes = sorted(size_time_map.keys())
            times = [size_time_map[s] for s in sizes]
            try:
                result = experimental_analyzer.analyze(
                    algorithm_name=algo_name,
                    complexity=complexity,
                    dataset_sizes=sizes,
                    observed_times=times,
                )
                analyses[algo_name] = {
                    "complexity":           complexity,
                    "color":                _ALGO_COLOR.get(algo_name, "#94a3b8"),
                    "fitness_score":        result.fitness_score,
                    "mean_growth_ratio":    result.mean_growth_ratio,
                    "theoretical_mean":     result.theoretical_mean,
                    "summary":              result.summary,
                    "points": [
                        {
                            "dataset_size":        p.dataset_size,
                            "observed_time_ms":    round(p.observed_time * 1000, 4),
                            "theoretical_value":   round(p.theoretical_value, 6),
                            "normalized_observed": round(p.normalized_observed, 6),
                            "growth_ratio":
                                round(p.growth_ratio, 4) if p.growth_ratio is not None else None,
                            "theoretical_ratio":
                                round(p.theoretical_ratio, 4) if p.theoretical_ratio is not None else None,
                        }
                        for p in result.points
                    ],
                }
            except Exception as exc:
                logger.debug("ExperimentalAnalyzer skipped for '%s': %s", algo_name, exc)

        job.analyses = analyses


# ── Module-level singleton ────────────────────────────────────────────────────
SWEEP_SERVICE = SweepService()
