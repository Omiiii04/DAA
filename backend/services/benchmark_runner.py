"""
Benchmark Runner Service.

Runs each algorithm exactly `iterations` times (default: 10) on a given price
array, measuring execution time and peak memory usage per iteration.

Memory Management Protocol (STRICT — enforced per iteration):
    1. gc.collect()             → purge all unreferenced objects before starting
    2. prices_copy = prices.copy() → fresh independent array per iteration
    3. Execute algorithm (time measured via time.perf_counter())
    4. Memory measured via memory_profiler or psutil fallback
    5. del prices_copy          → immediately release this iteration's copy
    6. gc.collect()             → reclaim freed memory before next iteration

This protocol prevents:
    - Memory fragmentation across iterations
    - Stale object references inflating peak memory readings
    - Heap growth that could trigger OS swap on mid-range hardware

Async Safety:
    Heavy O(N²) benchmarks run inside asyncio.to_thread() via the async
    wrapper run_full_benchmark_async(). This prevents the FastAPI event loop
    from blocking, maintaining responsiveness for concurrent API requests.

Statistics Computed Per Algorithm (N=10 iterations):
    Mean, Median, Min, Max, Standard Deviation
    (for both execution time in seconds and memory delta in MB)
"""

from __future__ import annotations

import asyncio
import gc
import logging
import statistics
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from algorithms.base import AlgorithmStrategy, SubarrayResult
from algorithms.registry import ALGORITHM_REGISTRY
from config import settings

logger = logging.getLogger(__name__)

# ── Memory measurement backend ─────────────────────────────────────────────────
try:
    from memory_profiler import memory_usage as _mp_memory_usage
    _MEMORY_BACKEND = "memory_profiler"
except ImportError:
    _mp_memory_usage = None
    _MEMORY_BACKEND = "psutil"
    logger.warning(
        "memory_profiler not installed. Falling back to psutil for memory measurement. "
        "For accurate results: pip install memory-profiler"
    )

try:
    import psutil as _psutil
    import os as _os
    _PSUTIL_AVAILABLE = True
except ImportError:
    _psutil = None
    _PSUTIL_AVAILABLE = False
    logger.warning("psutil not installed. Memory measurements will be skipped.")


# ══════════════════════════════════════════════════════════════════════════════
# Data Transfer Objects
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class BenchmarkStats:
    """
    Aggregated statistics for one algorithm over N iterations.

    time_*   fields: execution time in seconds (time.perf_counter precision).
    memory_* fields: peak memory DELTA in MB (None if measurement unavailable).
    raw_*    fields: per-iteration raw values (for distribution analysis).
    last_result: The SubarrayResult from the final iteration (for cross-verification).
    """

    algorithm_name: str
    dataset_size: int
    iterations: int

    # Time statistics (seconds)
    mean_time:   float
    median_time: float
    min_time:    float
    max_time:    float
    std_time:    float
    raw_times:   list[float] = field(default_factory=list)

    # Memory statistics (MB) — None if measurement unavailable
    mean_memory_mb:   Optional[float] = None
    median_memory_mb: Optional[float] = None
    min_memory_mb:    Optional[float] = None
    max_memory_mb:    Optional[float] = None
    std_memory_mb:    Optional[float] = None
    raw_memories:     list[float] = field(default_factory=list)

    # Result from the last iteration (for cross-algorithm verification)
    last_result: Optional[SubarrayResult] = None


@dataclass
class FullBenchmarkReport:
    """
    Complete benchmark report across all three algorithms for one dataset.

    stats: dict maps algorithm_name → BenchmarkStats.
    Algorithms that exceeded their safe size limit are absent from this dict.
    """

    dataset_size:        int
    sha256_hash:         str
    iterations:          int
    stats:               dict[str, BenchmarkStats]
    verification_passed: bool
    verification_notes:  list[str]


# ══════════════════════════════════════════════════════════════════════════════
# Memory Measurement Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _measure_with_memory_profiler(
    algorithm: AlgorithmStrategy,
    prices_copy: np.ndarray,
) -> tuple[float, float, SubarrayResult]:
    """
    Measure execution time + peak memory delta using memory_profiler.

    Returns:
        (elapsed_seconds, memory_delta_mb, result)
    """
    t_start = time.perf_counter()
    mem_samples, result = _mp_memory_usage(
        (algorithm.run, (prices_copy,), {}),
        interval=0.005,          # 5ms sampling → low overhead
        retval=True,
        include_children=False,
    )
    t_end = time.perf_counter()

    elapsed = t_end - t_start
    # Delta = peak - baseline (first sample = memory before function starts)
    mem_delta = float(max(mem_samples) - mem_samples[0]) if len(mem_samples) > 1 else 0.0
    return elapsed, max(0.0, mem_delta), result


def _measure_with_psutil(
    algorithm: AlgorithmStrategy,
    prices_copy: np.ndarray,
) -> tuple[float, float, SubarrayResult]:
    """
    Measure execution time + peak memory delta using psutil (fallback).

    Returns:
        (elapsed_seconds, memory_delta_mb, result)
    """
    process = _psutil.Process(_os.getpid())
    baseline_mb = process.memory_info().rss / 1_048_576  # bytes → MB

    t_start = time.perf_counter()
    result = algorithm.run(prices_copy)
    t_end = time.perf_counter()

    peak_mb = process.memory_info().rss / 1_048_576
    elapsed = t_end - t_start
    mem_delta = max(0.0, peak_mb - baseline_mb)
    return elapsed, mem_delta, result


def _measure_time_only(
    algorithm: AlgorithmStrategy,
    prices_copy: np.ndarray,
) -> tuple[float, float, SubarrayResult]:
    """
    Time-only measurement when no memory profiler is available.

    Returns:
        (elapsed_seconds, 0.0, result)
    """
    t_start = time.perf_counter()
    result = algorithm.run(prices_copy)
    elapsed = time.perf_counter() - t_start
    return elapsed, 0.0, result


def _measure(
    algorithm: AlgorithmStrategy,
    prices_copy: np.ndarray,
) -> tuple[float, float, SubarrayResult]:
    """
    Route to the best available memory measurement backend.
    Priority: memory_profiler > psutil > time-only.
    """
    if _MEMORY_BACKEND == "memory_profiler":
        return _measure_with_memory_profiler(algorithm, prices_copy)
    elif _PSUTIL_AVAILABLE:
        return _measure_with_psutil(algorithm, prices_copy)
    else:
        return _measure_time_only(algorithm, prices_copy)


# ══════════════════════════════════════════════════════════════════════════════
# Core Benchmark Runner
# ══════════════════════════════════════════════════════════════════════════════

class BenchmarkRunner:
    """
    Orchestrates multi-iteration benchmarking across all registered algorithms.

    For each algorithm × dataset pair:
        1. Validates dataset size against algorithm.max_safe_input_size.
        2. Runs `iterations` timed + memory-profiled executions.
        3. Applies strict gc.collect() + del between every iteration.
        4. Aggregates raw measurements into BenchmarkStats.

    Thread-safety:
        BenchmarkRunner is stateless between calls — safe for concurrent use.
        Run inside asyncio.to_thread() to avoid blocking the FastAPI event loop.
    """

    def __init__(self, iterations: int = settings.benchmark_iterations) -> None:
        self.iterations = iterations

    # ── Single Algorithm Benchmark ────────────────────────────────────────────

    def benchmark_algorithm(
        self,
        algorithm: AlgorithmStrategy,
        prices: np.ndarray,
    ) -> BenchmarkStats:
        """
        Run a single algorithm for `self.iterations` timed iterations.

        Memory Management Protocol applied per iteration (see module docstring).

        Args:
            algorithm: Concrete AlgorithmStrategy instance.
            prices:    Source price array (NOT modified — copies used internally).

        Returns:
            BenchmarkStats with all 5 statistics for time and memory.

        Raises:
            ValueError: If len(prices) > algorithm.max_safe_input_size.
        """
        n = len(prices)

        # ── Safety gate ───────────────────────────────────────────────────────
        if n > algorithm.max_safe_input_size:
            raise ValueError(
                f"{algorithm.name} enforces a safe size limit of "
                f"{algorithm.max_safe_input_size:,} elements but received {n:,}. "
                "Either reduce the dataset size or use a more efficient algorithm."
            )

        times:    list[float] = []
        memories: list[float] = []
        last_result: Optional[SubarrayResult] = None

        logger.info(
            "Benchmarking '%s' | N=%d | %d iterations | backend=%s",
            algorithm.name, n, self.iterations, _MEMORY_BACKEND
        )

        for i in range(self.iterations):
            # ── Step 1: Pre-iteration garbage collection ──────────────────────
            gc.collect()

            # ── Step 2: Fresh independent copy ───────────────────────────────
            prices_copy = prices.copy()

            try:
                # ── Step 3: Timed + memory-measured execution ─────────────────
                elapsed, mem_delta, result = _measure(algorithm, prices_copy)

                times.append(elapsed)
                memories.append(mem_delta)
                last_result = result

            finally:
                # ── Step 4+5: ALWAYS release copy, then collect ───────────────
                del prices_copy
                gc.collect()

            logger.debug(
                "  [%02d/%02d] %s → %.6fs | Δmem=%.3fMB",
                i + 1, self.iterations,
                algorithm.name, elapsed,
                mem_delta,
            )

        # ── Aggregate statistics ──────────────────────────────────────────────
        return BenchmarkStats(
            algorithm_name=algorithm.name,
            dataset_size=n,
            iterations=self.iterations,
            mean_time=statistics.mean(times),
            median_time=statistics.median(times),
            min_time=min(times),
            max_time=max(times),
            std_time=statistics.stdev(times) if len(times) > 1 else 0.0,
            raw_times=times,
            **self._memory_stats(memories),
            last_result=last_result,
        )

    @staticmethod
    def _memory_stats(memories: list[float]) -> dict:
        """Build memory statistics dict from raw per-iteration readings."""
        if not memories or all(m == 0.0 for m in memories):
            return {
                "mean_memory_mb": None,
                "median_memory_mb": None,
                "min_memory_mb": None,
                "max_memory_mb": None,
                "std_memory_mb": None,
                "raw_memories": memories,
            }
        return {
            "mean_memory_mb":   statistics.mean(memories),
            "median_memory_mb": statistics.median(memories),
            "min_memory_mb":    min(memories),
            "max_memory_mb":    max(memories),
            "std_memory_mb":    statistics.stdev(memories) if len(memories) > 1 else 0.0,
            "raw_memories":     memories,
        }

    # ── Full Suite Benchmark ──────────────────────────────────────────────────

    def run_full_benchmark(
        self,
        prices: np.ndarray,
        sha256_hash: str,
        algorithm_names: Optional[list[str]] = None,
    ) -> FullBenchmarkReport:
        """
        Run benchmarks for all (or specified) algorithms and verify consistency.

        Algorithms that exceed their safe size limit are SKIPPED (not crashed).
        After all algorithms run, their results are cross-verified for agreement
        on max_profit (within 1e-6 tolerance).

        Args:
            prices:          Source price array.
            sha256_hash:     Pre-computed SHA-256 hash (from CacheService).
            algorithm_names: Subset of algorithms to run. None = run all.

        Returns:
            FullBenchmarkReport with per-algorithm stats and verification.
        """
        n = len(prices)
        names = algorithm_names or ALGORITHM_REGISTRY.names()
        all_stats: dict[str, BenchmarkStats] = {}

        for name in names:
            algo = ALGORITHM_REGISTRY.get(name)
            if n > algo.max_safe_input_size:
                logger.warning(
                    "SKIP '%s': N=%d exceeds safe limit of %d",
                    name, n, algo.max_safe_input_size
                )
                continue
            all_stats[name] = self.benchmark_algorithm(algo, prices)

        # ── Cross-verify results ──────────────────────────────────────────────
        verified, notes = self._verify_results(all_stats)

        return FullBenchmarkReport(
            dataset_size=n,
            sha256_hash=sha256_hash,
            iterations=self.iterations,
            stats=all_stats,
            verification_passed=verified,
            verification_notes=notes,
        )

    @staticmethod
    def _verify_results(
        all_stats: dict[str, BenchmarkStats],
        tolerance: float = 1e-6,
    ) -> tuple[bool, list[str]]:
        """
        Cross-verify max_profit consistency across all algorithms that ran.

        Note: buy/sell indices may legitimately differ when multiple subarrays
        tie for maximum profit — only max_profit is compared for verification.

        Returns:
            (all_match: bool, notes: list[str])
        """
        results = {
            name: stats.last_result
            for name, stats in all_stats.items()
            if stats.last_result is not None
        }

        if len(results) < 2:
            return True, ["< 2 algorithms ran — cross-verification skipped."]

        profits = {name: r.max_profit for name, r in results.items()}
        reference_profit = next(iter(profits.values()))
        notes: list[str] = []
        all_match = True

        for name, profit in profits.items():
            diff = abs(profit - reference_profit)
            if diff > tolerance:
                all_match = False
                notes.append(
                    f"⚠ MISMATCH: '{name}' returned {profit:.8f}, "
                    f"expected ≈{reference_profit:.8f} (Δ={diff:.2e})"
                )

        if all_match:
            algo_list = " | ".join(
                f"{n}: {p:.6f}" for n, p in profits.items()
            )
            notes.append(f"✓ All {len(results)} algorithms agree. [{algo_list}]")

        return all_match, notes

    # ── Async Interface (Phase 2 API) ─────────────────────────────────────────

    async def run_full_benchmark_async(
        self,
        prices: np.ndarray,
        sha256_hash: str,
        algorithm_names: Optional[list[str]] = None,
    ) -> FullBenchmarkReport:
        """
        Non-blocking async wrapper using asyncio.to_thread.

        Moves the CPU-bound benchmark work to a thread pool, ensuring the
        FastAPI event loop remains responsive during O(N²) benchmarks.

        Called by POST /api/v1/benchmark route (Phase 2).
        """
        return await asyncio.to_thread(
            self.run_full_benchmark,
            prices,
            sha256_hash,
            algorithm_names,
        )


# ── Module-level default runner ────────────────────────────────────────────────
benchmark_runner = BenchmarkRunner()
