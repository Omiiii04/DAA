"""
Unit Tests — Benchmark Runner Service.

Validates:
    BenchmarkStats:
        - Correct structure (all fields present)
        - Statistical invariants (min ≤ median ≤ mean ≤ max)
        - Correct algorithm name and dataset size
        - Correct iteration count and raw_times length
        - Positive execution times
        - Non-negative standard deviation

    Safety limits:
        - Algorithms refuse oversized datasets
        - Kadane accepts large (50K) datasets

    Full Benchmark Report:
        - All three algorithms run and appear in report.stats
        - Verification passes on valid data

    Async interface:
        - run_full_benchmark_async returns correct report type

Note: With 3 iterations (test fixture), tests run fast (<1 second for small N).
"""

import numpy as np
import pytest

from services.benchmark_runner import BenchmarkRunner, BenchmarkStats, FullBenchmarkReport


# ══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def runner():
    """BenchmarkRunner with 3 iterations for fast unit tests."""
    return BenchmarkRunner(iterations=3)


@pytest.fixture(scope="module")
def small_prices() -> np.ndarray:
    """50-element random walk — safe for all algorithms in <50ms."""
    rng = np.random.default_rng(seed=77)
    return 100.0 + np.cumsum(rng.normal(0, 1, 50))


_DUMMY_HASH = "a" * 64


# ══════════════════════════════════════════════════════════════════════════════
# BenchmarkStats Structure
# ══════════════════════════════════════════════════════════════════════════════

class TestBenchmarkStatsStructure:

    def test_returns_correct_type(self, runner, brute_force, small_prices):
        stats = runner.benchmark_algorithm(brute_force, small_prices)
        assert isinstance(stats, BenchmarkStats)

    def test_algorithm_name_matches(self, runner, brute_force, small_prices):
        stats = runner.benchmark_algorithm(brute_force, small_prices)
        assert stats.algorithm_name == "Brute Force"

    def test_dataset_size_matches(self, runner, brute_force, small_prices):
        stats = runner.benchmark_algorithm(brute_force, small_prices)
        assert stats.dataset_size == len(small_prices)

    def test_iterations_field_matches(self, runner, brute_force, small_prices):
        stats = runner.benchmark_algorithm(brute_force, small_prices)
        assert stats.iterations == 3

    def test_raw_times_length_matches_iterations(self, runner, brute_force, small_prices):
        stats = runner.benchmark_algorithm(brute_force, small_prices)
        assert len(stats.raw_times) == 3

    def test_last_result_is_populated(self, runner, brute_force, small_prices):
        stats = runner.benchmark_algorithm(brute_force, small_prices)
        assert stats.last_result is not None
        assert stats.last_result.max_profit is not None

    def test_last_result_has_valid_indices(self, runner, brute_force, small_prices):
        stats = runner.benchmark_algorithm(brute_force, small_prices)
        r = stats.last_result
        assert 0 <= r.buy_index < len(small_prices)
        assert 0 <= r.sell_index < len(small_prices)
        assert r.sell_index > r.buy_index


# ══════════════════════════════════════════════════════════════════════════════
# Statistical Invariants
# ══════════════════════════════════════════════════════════════════════════════

class TestStatisticalInvariants:

    @pytest.fixture(params=["brute_force", "divide_and_conquer", "kadane"])
    def any_algo(self, request, brute_force, divide_and_conquer, kadane):
        return {
            "brute_force": brute_force,
            "divide_and_conquer": divide_and_conquer,
            "kadane": kadane,
        }[request.param]

    def test_times_are_positive(self, runner, any_algo, small_prices):
        stats = runner.benchmark_algorithm(any_algo, small_prices)
        assert all(t > 0 for t in stats.raw_times)

    def test_min_le_median_le_mean_le_max(self, runner, any_algo, small_prices):
        stats = runner.benchmark_algorithm(any_algo, small_prices)
        assert stats.min_time <= stats.median_time
        assert stats.median_time <= stats.max_time
        assert stats.min_time <= stats.mean_time <= stats.max_time

    def test_std_is_non_negative(self, runner, any_algo, small_prices):
        stats = runner.benchmark_algorithm(any_algo, small_prices)
        assert stats.std_time >= 0.0

    def test_min_le_max(self, runner, any_algo, small_prices):
        stats = runner.benchmark_algorithm(any_algo, small_prices)
        assert stats.min_time <= stats.max_time


# ══════════════════════════════════════════════════════════════════════════════
# Safety Size Limits
# ══════════════════════════════════════════════════════════════════════════════

class TestSafeSizeLimits:

    def test_brute_force_rejects_oversized(self, runner, brute_force):
        """25,000 exceeds BruteForce limit of 20,000."""
        oversized = np.ones(25_000)
        with pytest.raises(ValueError, match="safe size limit"):
            runner.benchmark_algorithm(brute_force, oversized)

    def test_divide_conquer_rejects_oversized(self, runner, divide_and_conquer):
        """150,000 exceeds D&C limit of 100,000."""
        oversized = np.ones(150_000)
        with pytest.raises(ValueError, match="safe size limit"):
            runner.benchmark_algorithm(divide_and_conquer, oversized)

    def test_kadane_accepts_50k(self, runner, kadane):
        """50,000 is well within Kadane's 1,000,000 limit."""
        rng = np.random.default_rng(seed=1)
        prices = 100.0 + np.cumsum(rng.normal(0, 1, 50_000))
        stats = runner.benchmark_algorithm(kadane, prices)
        assert stats.dataset_size == 50_000
        assert stats.iterations == 3


# ══════════════════════════════════════════════════════════════════════════════
# Full Benchmark Report
# ══════════════════════════════════════════════════════════════════════════════

class TestFullBenchmarkReport:

    def test_returns_correct_type(self, runner, small_prices):
        report = runner.run_full_benchmark(small_prices, _DUMMY_HASH)
        assert isinstance(report, FullBenchmarkReport)

    def test_all_three_algorithms_present(self, runner, small_prices):
        report = runner.run_full_benchmark(small_prices, _DUMMY_HASH)
        assert "Brute Force" in report.stats
        assert "Divide & Conquer" in report.stats
        assert "Kadane's Algorithm" in report.stats

    def test_dataset_size_correct(self, runner, small_prices):
        report = runner.run_full_benchmark(small_prices, _DUMMY_HASH)
        assert report.dataset_size == len(small_prices)

    def test_hash_stored(self, runner, small_prices):
        report = runner.run_full_benchmark(small_prices, _DUMMY_HASH)
        assert report.sha256_hash == _DUMMY_HASH

    def test_verification_passes_on_valid_data(self, runner, small_prices):
        report = runner.run_full_benchmark(small_prices, _DUMMY_HASH)
        assert report.verification_passed is True

    def test_verification_notes_not_empty(self, runner, small_prices):
        report = runner.run_full_benchmark(small_prices, _DUMMY_HASH)
        assert len(report.verification_notes) > 0

    def test_brute_force_skipped_for_large_input(self, runner):
        """For N=25,000, Brute Force should be skipped (not crash)."""
        rng = np.random.default_rng(seed=2)
        large_prices = 100.0 + np.cumsum(rng.normal(0, 1, 25_000))
        report = runner.run_full_benchmark(large_prices, "b" * 64)
        assert "Brute Force" not in report.stats
        assert "Divide & Conquer" in report.stats
        assert "Kadane's Algorithm" in report.stats

    def test_specific_algorithms_subset(self, runner, small_prices):
        """Should be able to run only a subset of algorithms."""
        report = runner.run_full_benchmark(
            small_prices, _DUMMY_HASH, algorithm_names=["Kadane's Algorithm"]
        )
        assert "Kadane's Algorithm" in report.stats
        assert "Brute Force" not in report.stats


# ══════════════════════════════════════════════════════════════════════════════
# Async Interface
# ══════════════════════════════════════════════════════════════════════════════

class TestAsyncInterface:

    @pytest.mark.asyncio
    async def test_async_returns_full_report(self, runner, small_prices):
        report = await runner.run_full_benchmark_async(small_prices, "c" * 64)
        assert isinstance(report, FullBenchmarkReport)

    @pytest.mark.asyncio
    async def test_async_verification_passes(self, runner, small_prices):
        report = await runner.run_full_benchmark_async(small_prices, "d" * 64)
        assert report.verification_passed is True

    @pytest.mark.asyncio
    async def test_async_contains_all_algorithms(self, runner, small_prices):
        report = await runner.run_full_benchmark_async(small_prices, "e" * 64)
        assert len(report.stats) == 3
