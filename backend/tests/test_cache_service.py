"""
Unit Tests — CacheService (SHA-256 Content-Addressed Caching).

Validates:
    Hash Computation:
        - 64-character lowercase hex output
        - Determinism: same input → same hash
        - Sensitivity: different input → different hash
        - Order sensitivity: [1,2,3] ≠ [3,2,1]
        - Float normalization: tiny (<1e-6) differences hash identically
        - Large array performance (<1 second for N=1M)

    Database Lookup:
        - Returns None for unknown hashes
        - Returns False/True from has_dataset
        - Correctly retrieves inserted Dataset records
        - has_benchmark_cache returns False with no benchmark rows
        - has_benchmark_cache returns True when ≥3 rows exist
"""

import numpy as np
import pytest

from database.models import BenchmarkResult, Dataset
from services.cache_service import CacheService


# ══════════════════════════════════════════════════════════════════════════════
# Hash Computation Tests
# ══════════════════════════════════════════════════════════════════════════════

class TestHashComputation:

    def test_hash_is_64_characters(self):
        prices = np.array([1.0, 2.0, 3.0])
        h = CacheService.compute_hash(prices)
        assert len(h) == 64

    def test_hash_is_lowercase_hex(self):
        prices = np.array([1.0, 2.0, 3.0])
        h = CacheService.compute_hash(prices)
        assert all(c in "0123456789abcdef" for c in h)

    def test_hash_is_deterministic(self):
        prices = np.array([7.0, 1.0, 5.0, 3.0, 6.0, 4.0])
        h1 = CacheService.compute_hash(prices)
        h2 = CacheService.compute_hash(prices)
        assert h1 == h2

    def test_identical_arrays_same_hash(self):
        a = np.array([100.0, 101.0, 99.0])
        b = np.array([100.0, 101.0, 99.0])
        assert CacheService.compute_hash(a) == CacheService.compute_hash(b)

    def test_different_value_different_hash(self):
        a = np.array([1.0, 2.0, 3.0])
        b = np.array([1.0, 2.0, 4.0])  # Last element differs by 1
        assert CacheService.compute_hash(a) != CacheService.compute_hash(b)

    def test_different_size_different_hash(self):
        a = np.array([1.0, 2.0, 3.0])
        b = np.array([1.0, 2.0, 3.0, 4.0])  # Extra element
        assert CacheService.compute_hash(a) != CacheService.compute_hash(b)

    def test_order_matters(self):
        a = np.array([1.0, 2.0, 3.0])
        b = np.array([3.0, 2.0, 1.0])
        assert CacheService.compute_hash(a) != CacheService.compute_hash(b)

    def test_float_noise_below_1e6_normalized(self):
        """
        Values that differ only in the 7th+ decimal should produce the same hash.
        This ensures platform float-representation differences don't cause cache misses.
        """
        a = np.array([1.0000000001, 2.0, 3.0])  # 1e-10 noise
        b = np.array([1.0000000009, 2.0, 3.0])  # 9e-10 noise
        # Both round to 1.000000 at 6 decimal places
        assert CacheService.compute_hash(a) == CacheService.compute_hash(b)

    def test_float_difference_above_1e6_detected(self):
        """Differences at the 6th decimal place SHOULD produce different hashes."""
        a = np.array([1.000001, 2.0, 3.0])
        b = np.array([1.000002, 2.0, 3.0])
        assert CacheService.compute_hash(a) != CacheService.compute_hash(b)

    def test_integer_dtype_array(self):
        """Integer arrays should be hashable without errors."""
        prices = np.array([10, 20, 15], dtype=np.int64)
        h = CacheService.compute_hash(prices)
        assert len(h) == 64

    def test_large_array_completes_quickly(self):
        """1M-element array should hash in <2 seconds on any modern machine."""
        import time
        prices = np.ones(1_000_000, dtype=np.float64)
        t_start = time.perf_counter()
        h = CacheService.compute_hash(prices)
        elapsed = time.perf_counter() - t_start
        assert len(h) == 64
        assert elapsed < 2.0, f"Hashing 1M elements took {elapsed:.2f}s (limit: 2s)"


# ══════════════════════════════════════════════════════════════════════════════
# Database Lookup Tests (require db_session fixture)
# ══════════════════════════════════════════════════════════════════════════════

class TestDatabaseLookup:

    def _make_dataset(self, prices: np.ndarray, name: str = "test_ds") -> Dataset:
        """Helper: create a Dataset ORM object from a prices array."""
        return Dataset(
            name=name,
            sha256_hash=CacheService.compute_hash(prices),
            size=len(prices),
            source="generated",
        )

    def test_find_returns_none_for_unknown_hash(self, db_session):
        result = CacheService.find_dataset(db_session, "a" * 64)
        assert result is None

    def test_has_dataset_false_for_unknown(self, db_session):
        assert CacheService.has_dataset(db_session, "b" * 64) is False

    def test_has_dataset_true_after_insert(self, db_session):
        prices = np.array([10.0, 20.0, 15.0, 25.0])
        h = CacheService.compute_hash(prices)
        db_session.add(self._make_dataset(prices))
        db_session.flush()

        assert CacheService.has_dataset(db_session, h) is True

    def test_find_returns_correct_record(self, db_session):
        prices = np.array([5.0, 10.0, 8.0, 12.0, 7.0])
        h = CacheService.compute_hash(prices)
        ds = Dataset(name="lookup_target", sha256_hash=h, size=5, source="uploaded")
        db_session.add(ds)
        db_session.flush()

        found = CacheService.find_dataset(db_session, h)
        assert found is not None
        assert found.name == "lookup_target"
        assert found.size == 5

    def test_benchmark_cache_false_with_no_results(self, db_session):
        prices = np.array([1.0, 2.0, 3.0, 2.0, 4.0])
        h = CacheService.compute_hash(prices)
        db_session.add(self._make_dataset(prices, name="no_benchmarks"))
        db_session.flush()

        assert CacheService.has_benchmark_cache(db_session, h) is False

    def test_benchmark_cache_false_for_unknown_hash(self, db_session):
        assert CacheService.has_benchmark_cache(db_session, "f" * 64) is False

    def test_benchmark_cache_true_with_three_results(self, db_session):
        """After inserting 3 BenchmarkResult rows, has_benchmark_cache → True."""
        prices = np.array([1.0, 3.0, 2.0, 4.0, 3.0, 5.0])
        h = CacheService.compute_hash(prices)
        ds = Dataset(name="with_benchmarks", sha256_hash=h, size=6, source="generated")
        db_session.add(ds)
        db_session.flush()

        for algo_name in ["Brute Force", "Divide & Conquer", "Kadane's Algorithm"]:
            db_session.add(BenchmarkResult(
                dataset_id=ds.id,
                algorithm_name=algo_name,
                dataset_size=6,
                iterations=10,
                mean_time=0.001, median_time=0.001,
                min_time=0.0009, max_time=0.0011,
                std_time=0.00005,
            ))
        db_session.flush()

        assert CacheService.has_benchmark_cache(db_session, h) is True

    def test_get_cached_benchmarks_returns_correct_count(self, db_session):
        prices = np.array([2.0, 4.0, 3.0, 5.0, 4.0, 6.0])
        h = CacheService.compute_hash(prices)
        ds = Dataset(name="cached_ds", sha256_hash=h, size=6, source="generated")
        db_session.add(ds)
        db_session.flush()

        for algo_name in ["Brute Force", "Divide & Conquer", "Kadane's Algorithm"]:
            db_session.add(BenchmarkResult(
                dataset_id=ds.id, algorithm_name=algo_name,
                dataset_size=6, iterations=10,
                mean_time=0.002, median_time=0.002,
                min_time=0.001, max_time=0.003, std_time=0.0005,
            ))
        db_session.flush()

        results = CacheService.get_cached_benchmarks(db_session, h)
        assert len(results) == 3

    def test_get_cached_benchmarks_empty_for_unknown(self, db_session):
        results = CacheService.get_cached_benchmarks(db_session, "9" * 64)
        assert results == []
