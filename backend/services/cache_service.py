"""
SHA-256 Content-Addressed Dataset Cache Service.

Before running any benchmark or analysis, the system hashes the input price
array with SHA-256. If a dataset with that hash already exists in the database
and has completed benchmark results, those results are returned immediately —
skipping all expensive O(N²) recomputation.

Why SHA-256?
    - Deterministic: same prices → same hash, every time, on every platform.
    - Collision-resistant: 2⁻²⁵⁶ collision probability (negligible).
    - Fast: ~50ms to hash 1,000,000 float64 values.
    - Content-addressed: two files with identical prices share cached results,
      even if they have different filenames or were generated separately.

Hash Normalization:
    Prices are rounded to 6 decimal places before hashing to avoid floating-point
    representation differences between platforms (e.g., 1.0000000001 vs 1.0).

Usage:
    hash_val = CacheService.compute_hash(prices)

    if CacheService.has_benchmark_cache(db, hash_val):
        return CacheService.get_cached_benchmarks(db, hash_val)
    else:
        # Run benchmarks, then store results
        ...
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Optional

import numpy as np
from sqlalchemy.orm import Session

from database.models import BenchmarkResult, Dataset

logger = logging.getLogger(__name__)

# Number of BenchmarkResult rows expected for a fully-cached dataset
# (one per algorithm: Brute Force, Divide & Conquer, Kadane's)
_EXPECTED_BENCHMARK_ROWS = 3


class CacheService:
    """
    Static utility class for SHA-256 content-addressed result caching.

    All methods are @staticmethod — no instance or class state is maintained.
    Thread-safe: all operations are read-only DB queries or pure computation.
    """

    # ── Hash Computation ──────────────────────────────────────────────────────

    @staticmethod
    def compute_hash(prices: np.ndarray) -> str:
        """
        Compute a deterministic SHA-256 hash for a price array.

        Normalization steps applied before hashing:
            1. Cast to float64 (consistent representation across dtypes).
            2. Round to 6 decimal places (suppress floating-point noise).
            3. Serialize to compact JSON (no whitespace).
            4. Encode to UTF-8 bytes.
            5. SHA-256 digest → 64-char lowercase hex string.

        Args:
            prices: 1D numpy array of stock closing prices.

        Returns:
            64-character lowercase hex SHA-256 digest.
        """
        # Normalize: float64, 6 decimal places, compact JSON
        normalized = np.round(prices.astype(np.float64), decimals=6)
        payload = json.dumps(
            normalized.tolist(), separators=(",", ":")
        ).encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    # ── Dataset Cache ─────────────────────────────────────────────────────────

    @staticmethod
    def find_dataset(db: Session, sha256_hash: str) -> Optional[Dataset]:
        """
        Look up a Dataset record by its SHA-256 hash.

        Args:
            db:          Open database session.
            sha256_hash: 64-char hex string from compute_hash().

        Returns:
            Dataset ORM object, or None if not found.
        """
        return (
            db.query(Dataset)
            .filter(Dataset.sha256_hash == sha256_hash)
            .first()
        )

    @staticmethod
    def has_dataset(db: Session, sha256_hash: str) -> bool:
        """Return True if a Dataset with this hash exists."""
        return CacheService.find_dataset(db, sha256_hash) is not None

    # ── Benchmark Cache ───────────────────────────────────────────────────────

    @staticmethod
    def has_benchmark_cache(db: Session, sha256_hash: str) -> bool:
        """
        Return True if COMPLETE benchmark results exist for this hash.

        "Complete" means at least _EXPECTED_BENCHMARK_ROWS (3) BenchmarkResult
        rows are stored for this dataset — one per classical algorithm.

        Args:
            db:          Open database session.
            sha256_hash: SHA-256 hash of the dataset.

        Returns:
            True if all algorithm benchmarks are cached, False otherwise.
        """
        dataset = CacheService.find_dataset(db, sha256_hash)
        if dataset is None:
            logger.debug("Cache miss (no dataset): hash=%s...", sha256_hash[:8])
            return False

        count = (
            db.query(BenchmarkResult)
            .filter(BenchmarkResult.dataset_id == dataset.id)
            .count()
        )
        cached = count >= _EXPECTED_BENCHMARK_ROWS
        if cached:
            logger.info(
                "Cache HIT: %d benchmark rows for hash=%s...",
                count, sha256_hash[:8]
            )
        else:
            logger.debug(
                "Cache MISS: only %d/%d benchmark rows for hash=%s...",
                count, _EXPECTED_BENCHMARK_ROWS, sha256_hash[:8]
            )
        return cached

    @staticmethod
    def get_cached_benchmarks(
        db: Session, sha256_hash: str
    ) -> list[BenchmarkResult]:
        """
        Retrieve all cached BenchmarkResult rows for the given hash.

        Args:
            db:          Open database session.
            sha256_hash: SHA-256 hash of the dataset.

        Returns:
            List of BenchmarkResult ORM objects (empty if not cached).
        """
        dataset = CacheService.find_dataset(db, sha256_hash)
        if dataset is None:
            return []

        results = (
            db.query(BenchmarkResult)
            .filter(BenchmarkResult.dataset_id == dataset.id)
            .order_by(BenchmarkResult.algorithm_name)
            .all()
        )
        logger.info(
            "Returned %d cached benchmark(s) for dataset_id=%d",
            len(results), dataset.id
        )
        return results

    @staticmethod
    def invalidate_dataset(db: Session, sha256_hash: str) -> bool:
        """
        Delete a dataset and all its associated results (full cache invalidation).

        Used when re-uploading a dataset that needs fresh benchmarks.

        Returns:
            True if a dataset was found and deleted, False if not found.
        """
        dataset = CacheService.find_dataset(db, sha256_hash)
        if dataset is None:
            return False
        db.delete(dataset)
        db.commit()
        logger.info("Cache invalidated for hash=%s...", sha256_hash[:8])
        return True
