"""
Feature Engine — Phase 6.

Extracts ML-ready feature matrices from raw price arrays.

Feature Set (per price point):
    price            Raw price (before normalization)
    daily_return     (price[i] - price[i-1]) / price[i-1]
    rolling_mean_20  20-day rolling average price
    rolling_std_20   20-day rolling standard deviation of prices
    z_score          (price - rolling_mean) / rolling_std
    momentum_5       (price[i] / price[i-5]) - 1   (5-day momentum)
    momentum_20      (price[i] / price[i-20]) - 1  (20-day momentum)
    rsi_14           Relative Strength Index (14-day)
    bb_position      Bollinger Band position: (price - lower) / (upper - lower)
    abs_return       |daily_return|  (volatility proxy)

Window Feature Set (for regime clustering — per rolling window):
    mean_return      Mean daily return over window
    volatility       Std of daily returns over window
    trend_slope      Linear regression slope of prices in window (normalized)
    skewness         Return distribution skewness (proxy: max - min - 2*median)
"""

from __future__ import annotations

import math
from typing import Optional

import numpy as np


def extract_point_features(prices: np.ndarray) -> np.ndarray:
    """
    Extract per-point feature matrix from a price series.

    Args:
        prices: 1-D float64 array of N price points.

    Returns:
        Feature matrix of shape (N, 10). NaN/Inf values are zero-filled.
    """
    n = len(prices)
    eps = 1e-8   # Numerical safety

    # ── Daily returns ─────────────────────────────────────────────────────────
    returns = np.zeros(n, dtype=np.float64)
    returns[1:] = np.diff(prices) / (prices[:-1] + eps)
    returns = np.clip(returns, -5.0, 5.0)   # Cap extreme outliers

    # ── Rolling statistics (window=20) ────────────────────────────────────────
    w = min(20, max(5, n // 20))
    rolling_mean = np.empty(n, dtype=np.float64)
    rolling_std  = np.empty(n, dtype=np.float64)
    for i in range(n):
        window = prices[max(0, i - w + 1): i + 1]
        rolling_mean[i] = np.mean(window)
        rolling_std[i]  = np.std(window) + eps
    z_score = (prices - rolling_mean) / rolling_std

    # ── Momentum ──────────────────────────────────────────────────────────────
    mom5  = np.zeros(n, dtype=np.float64)
    mom20 = np.zeros(n, dtype=np.float64)
    for i in range(1, n):
        lag5  = max(0, i - 5)
        lag20 = max(0, i - 20)
        mom5[i]  = prices[i] / (prices[lag5]  + eps) - 1.0
        mom20[i] = prices[i] / (prices[lag20] + eps) - 1.0

    # ── RSI-14 ────────────────────────────────────────────────────────────────
    rsi_period = min(14, n // 5)
    rsi = _compute_rsi(returns, rsi_period)

    # ── Bollinger Band position ────────────────────────────────────────────────
    bb_pos = _compute_bollinger_position(prices, w)

    # ── Absolute returns (volatility proxy) ───────────────────────────────────
    abs_return = np.abs(returns)

    # ── Stack ─────────────────────────────────────────────────────────────────
    X = np.column_stack([
        prices,         # Feature 0: price
        returns,        # Feature 1: daily return
        rolling_mean,   # Feature 2: rolling mean
        rolling_std,    # Feature 3: rolling std
        z_score,        # Feature 4: z-score
        mom5,           # Feature 5: momentum 5
        mom20,          # Feature 6: momentum 20
        rsi,            # Feature 7: RSI-14
        bb_pos,         # Feature 8: Bollinger position
        abs_return,     # Feature 9: absolute return
    ])

    # Zero-fill NaN/Inf
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    return X


def extract_window_features(prices: np.ndarray, window_size: int = 50) -> tuple[np.ndarray, np.ndarray]:
    """
    Extract per-window feature matrix for regime clustering.

    Args:
        prices:      1-D float64 price array.
        window_size: Number of price points per window (stride = window_size//2).

    Returns:
        (features, midpoints)
        features:   shape (M, 4) — one row per window
        midpoints:  shape (M,)   — centre index of each window (for plotting)
    """
    n = len(prices)
    stride = max(1, window_size // 2)
    eps = 1e-8

    rows, mids = [], []
    for start in range(0, n - window_size + 1, stride):
        end     = start + window_size
        seg     = prices[start:end]
        ret_seg = np.diff(seg) / (seg[:-1] + eps)
        ret_seg = np.clip(ret_seg, -5.0, 5.0)

        mean_ret  = float(np.mean(ret_seg))
        vol       = float(np.std(ret_seg) + eps)

        # Normalized linear trend slope
        xs      = np.arange(len(seg), dtype=np.float64)
        ys      = (seg - seg[0]) / (seg[0] + eps)  # % change from window start
        slope   = float(np.polyfit(xs, ys, 1)[0]) if len(xs) >= 2 else 0.0

        # Return skewness (proxy)
        if len(ret_seg) >= 3:
            med  = float(np.median(ret_seg))
            skew = float((np.mean(ret_seg) - med) / (vol + eps))
        else:
            skew = 0.0

        rows.append([mean_ret, vol, slope, skew])
        mids.append((start + end) // 2)

    if not rows:
        return np.zeros((1, 4), dtype=np.float64), np.array([n // 2])

    X = np.nan_to_num(np.array(rows, dtype=np.float64), nan=0.0)
    return X, np.array(mids, dtype=np.int64)


# ── Private Helpers ────────────────────────────────────────────────────────────

def _compute_rsi(returns: np.ndarray, period: int) -> np.ndarray:
    """Compute Wilder's RSI for each point."""
    n = len(returns)
    rsi = np.full(n, 50.0, dtype=np.float64)
    if period < 2 or n < period + 1:
        return rsi

    gains  = np.maximum(returns, 0.0)
    losses = np.maximum(-returns, 0.0)

    avg_gain = np.mean(gains[1: period + 1])
    avg_loss = np.mean(losses[1: period + 1])

    for i in range(period, n):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        rs  = avg_gain / (avg_loss + 1e-8)
        rsi[i] = 100.0 - 100.0 / (1.0 + rs)

    return rsi


def _compute_bollinger_position(prices: np.ndarray, window: int) -> np.ndarray:
    """Compute price position within Bollinger Bands (0=lower, 1=upper)."""
    n      = len(prices)
    bb_pos = np.full(n, 0.5, dtype=np.float64)

    for i in range(window, n):
        seg    = prices[i - window: i + 1]
        mu     = float(np.mean(seg))
        sigma  = float(np.std(seg))
        upper  = mu + 2 * sigma
        lower  = mu - 2 * sigma
        span   = upper - lower
        if span > 1e-8:
            bb_pos[i] = (prices[i] - lower) / span
        else:
            bb_pos[i] = 0.5

    return np.clip(bb_pos, 0.0, 1.0)
