"""
LTTB (Largest Triangle Three Buckets) Downsampling Algorithm.

Developed by Sveinn Steinarsson (2013) for visually faithful time-series
downsampling. Unlike uniform sampling or averaging, LTTB preserves visual
shape by selecting the point in each bucket that maximizes the area of the
triangle formed with the previously selected point and the average of the
next bucket.

Why LTTB for Stock Prices?
    Uniform decimation loses sharp peaks and valleys — exactly the features
    that matter for stock price analysis. LTTB provably retains more visual
    information per point than any uniform scheme.

Triangle Area Formula (used for comparison — ×2 factor omitted):
    For three points A=(ax, ay), B=(bx, by), C=(cx, cy):
        area×2 = |(ax-cx)×(by-ay) - (ax-bx)×(cy-ay)|

    Since we only compare areas, the ×0.5 factor cancels out and is omitted.

Algorithm Complexity:
    Time:  O(N)        — Single pass with fixed bucket sizes
    Space: O(threshold) — Only stores selected indices

Usage:
    result = lttb_downsample(prices, threshold=5_000)
    print(result.downsampled_prices)   # 5,000 float64 values
    print(result.selected_indices)     # 5,000 original index positions

Frontend Usage (chart rendering):
    x_values = result.selected_indices   # Correct x-axis positions
    y_values = result.downsampled_prices # Price values to plot
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# Result Dataclass
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class DownsampleResult:
    """
    Result of LTTB downsampling.

    Attributes:
        downsampled_prices: Array of shape (threshold,) with LTTB-selected values.
        selected_indices:   Array of shape (threshold,) with original array indices.
                            Use these as x-axis values for correct chart rendering.
        original_size:      Length of the input array (N).
        returned_size:      Number of points returned (= threshold).
        is_downsampled:     Always True (if identity return, this class is not used).
    """
    downsampled_prices: np.ndarray  # dtype float64
    selected_indices:   np.ndarray  # dtype int64
    original_size:      int
    returned_size:      int

    @property
    def is_downsampled(self) -> bool:
        return self.returned_size < self.original_size


# ══════════════════════════════════════════════════════════════════════════════
# Core LTTB Algorithm
# ══════════════════════════════════════════════════════════════════════════════

def lttb_downsample(prices: np.ndarray, threshold: int) -> DownsampleResult:
    """
    Apply Largest Triangle Three Buckets downsampling to a price series.

    The algorithm divides the data into `threshold` equal-sized buckets.
    For each intermediate bucket, it selects the point that maximizes the
    triangle area with the previously selected point and the centroid of
    the next bucket. The first and last points are always included.

    Args:
        prices:    1D float64 numpy array of length N (N > threshold).
        threshold: Target number of output points. Must be ≥ 2.

    Returns:
        DownsampleResult containing the selected prices and their original indices.

    Raises:
        ValueError: If threshold < 2 or prices is not 1D.

    Note:
        If len(prices) ≤ threshold, call lttb_or_passthrough() which returns
        a DownsampleResult with identity mapping rather than calling this function.
    """
    if threshold < 2:
        raise ValueError(f"threshold must be ≥ 2, got {threshold}.")
    if prices.ndim != 1:
        raise ValueError(f"prices must be 1-D, got shape {prices.shape}.")

    n = len(prices)
    prices = prices.astype(np.float64)

    # Pre-allocate result arrays
    selected_indices = np.empty(threshold, dtype=np.int64)
    selected_prices  = np.empty(threshold, dtype=np.float64)

    # ── Always include first and last points ──────────────────────────────────
    selected_indices[0]  = 0
    selected_prices[0]   = prices[0]
    selected_indices[-1] = n - 1
    selected_prices[-1]  = prices[n - 1]

    # ── Bucket size (exclude first and last points, first and last "buckets") ──
    # The middle (threshold - 2) buckets span prices[1 .. n-2]
    bucket_size = (n - 2) / (threshold - 2)

    prev_idx = 0  # Index of the previously selected point (starts at first point)

    for i in range(1, threshold - 1):
        # ── Current bucket boundaries ─────────────────────────────────────────
        a = int(i       * bucket_size) + 1
        b = int((i + 1) * bucket_size) + 1
        b = min(b, n - 1)  # Never exceed the second-to-last point

        # ── Next bucket: compute average point C ───────────────────────────────
        c_start = b
        c_end   = min(int((i + 2) * bucket_size) + 1, n - 1)

        if c_start >= c_end:
            # Edge case: last intermediate bucket, c_end = last point
            avg_x = float(n - 1)
            avg_y = float(prices[n - 1])
        else:
            indices_c = np.arange(c_start, c_end, dtype=np.float64)
            avg_x = float(np.mean(indices_c))
            avg_y = float(np.mean(prices[c_start:c_end]))

        # ── Point A: previously selected ─────────────────────────────────────
        ax = float(prev_idx)
        ay = float(prices[prev_idx])

        # ── Find point B in current bucket that maximizes triangle area ────────
        # Area×2 = |(ax - cx)×(by - ay) - (ax - bx)×(cy - ay)|
        # Vectorized computation over current bucket:
        bx_arr = np.arange(a, b, dtype=np.float64)
        by_arr = prices[a:b]

        areas = np.abs(
            (ax - avg_x) * (by_arr - ay) -
            (ax - bx_arr) * (avg_y - ay)
        )

        # Select the point with maximum area (first occurrence on tie)
        best_local_idx = int(np.argmax(areas))
        best_global_idx = a + best_local_idx

        selected_indices[i] = best_global_idx
        selected_prices[i]  = prices[best_global_idx]
        prev_idx = best_global_idx

    return DownsampleResult(
        downsampled_prices=selected_prices,
        selected_indices=selected_indices,
        original_size=n,
        returned_size=threshold,
    )


def lttb_or_passthrough(prices: np.ndarray, threshold: int) -> DownsampleResult:
    """
    Apply LTTB if len(prices) > threshold, otherwise return the full array.

    This is the primary entry point for all callers (API routes, services).
    When no downsampling is needed (N ≤ threshold), the returned DownsampleResult
    has identity indices [0, 1, ..., N-1] and is_downsampled == False.

    Args:
        prices:    1D numpy array of stock prices.
        threshold: Maximum number of points to return.

    Returns:
        DownsampleResult ready for API serialization.
    """
    n = len(prices)
    prices_f64 = prices.astype(np.float64)

    if n <= threshold:
        # ── Passthrough: identity result ───────────────────────────────────────
        return DownsampleResult(
            downsampled_prices=prices_f64,
            selected_indices=np.arange(n, dtype=np.int64),
            original_size=n,
            returned_size=n,
        )

    logger.info(
        "LTTB: downsampling %d → %d points (%.1f%% compression)",
        n, threshold, (1 - threshold / n) * 100,
    )
    return lttb_downsample(prices_f64, threshold)
