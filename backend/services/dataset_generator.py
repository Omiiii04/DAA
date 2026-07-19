"""
Dataset Generator Service.

Generates synthetic stock price series using Log-Normal Random Walk (GBM),
the standard model for stock prices in quantitative finance:

    price[0] = start_price
    log_return[i] = Normal(drift, volatility)    # i = 1..N-1
    price[i] = price[i-1] × exp(log_return[i])

The log-normal model guarantees prices remain strictly positive (never go
negative or zero) and produces realistic-looking time series with fat tails.

Distribution Profiles:
    random          — Zero drift, σ=1.5%  (Brownian motion baseline)
    mostly_positive — μ=+0.5%, σ=1.2%    (bull market)
    mostly_negative — μ=-0.5%, σ=1.2%    (bear market)
    high_volatility — μ=0%,    σ=4.0%    (meme stock / crypto)
    low_volatility  — μ=+0.1%, σ=0.3%    (government bond / utility)

Size Limits:
    Minimum: 1,000  (arbitrary floor; <1K offers no interesting benchmark data)
    Maximum: 1,000,000 (matches Kadane's safe limit; ~8MB of float64 RAM)

SHA-256 Invariant:
    Given identical (size, distribution_type, start_price, seed), the same
    price array is always produced. This ensures generate() is idempotent:
    calling it twice with the same args returns a cache-hit on the second call.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ── Distribution parameter table ──────────────────────────────────────────────
# (daily_drift_pct, daily_volatility_pct)
_DISTRIBUTION_PARAMS: dict[str, tuple[float, float]] = {
    "random":          (0.000,  0.015),   # Zero drift, 1.5% daily σ
    "mostly_positive": (0.005,  0.012),   # +0.5% daily drift (bull)
    "mostly_negative": (-0.005, 0.012),   # -0.5% daily drift (bear)
    "high_volatility": (0.000,  0.040),   # 4.0% daily σ (crypto-like)
    "low_volatility":  (0.001,  0.003),   # 0.3% daily σ (bond-like)
}

_MIN_SIZE = 1_000
_MAX_SIZE = 1_000_000


# ══════════════════════════════════════════════════════════════════════════════
# Result Dataclass
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class GeneratedDataset:
    """Structured return value from DatasetGenerator.generate()."""
    prices:            np.ndarray
    distribution_type: str
    start_price:       float
    seed:              int
    min_price:         float
    max_price:         float
    mean_price:        float
    std_price:         float


# ══════════════════════════════════════════════════════════════════════════════
# Generator
# ══════════════════════════════════════════════════════════════════════════════

class DatasetGenerator:
    """
    Synthetic stock price generator using Log-Normal Random Walk.

    Stateless: safe to use as a module-level singleton.
    """

    # ── Public API ─────────────────────────────────────────────────────────────

    def generate(
        self,
        size: int,
        distribution_type: str = "random",
        start_price: float = 100.0,
        seed: Optional[int] = None,
    ) -> GeneratedDataset:
        """
        Generate a synthetic log-normal price series.

        Args:
            size:              Number of price points (1,000 ≤ N ≤ 1,000,000).
            distribution_type: One of the five profile keys (see module docstring).
            start_price:       Initial price (must be > 0).
            seed:              RNG seed for reproducibility. None = random seed.

        Returns:
            GeneratedDataset with the price array and descriptive statistics.

        Raises:
            ValueError: On invalid size, unknown distribution_type, or start_price ≤ 0.
        """
        self._validate_params(size, distribution_type, start_price)

        # Resolve or generate a seed (always stored for reproducibility metadata)
        if seed is None:
            rng_seed = int(np.random.randint(0, 2**31))
        else:
            rng_seed = int(seed)

        drift, volatility = _DISTRIBUTION_PARAMS[distribution_type]
        prices = self._lognormal_walk(size, start_price, drift, volatility, rng_seed)

        logger.info(
            "Generated dataset: N=%d, type=%s, seed=%d, start_price=%.2f",
            size, distribution_type, rng_seed, start_price
        )

        return GeneratedDataset(
            prices=prices,
            distribution_type=distribution_type,
            start_price=start_price,
            seed=rng_seed,
            min_price=float(np.min(prices)),
            max_price=float(np.max(prices)),
            mean_price=float(np.mean(prices)),
            std_price=float(np.std(prices)),
        )

    def supported_distributions(self) -> list[str]:
        """Return all supported distribution type keys."""
        return list(_DISTRIBUTION_PARAMS.keys())

    def distribution_description(self, distribution_type: str) -> dict:
        """Return the (drift, volatility) parameters for a distribution type."""
        if distribution_type not in _DISTRIBUTION_PARAMS:
            raise ValueError(
                f"Unknown distribution '{distribution_type}'. "
                f"Supported: {self.supported_distributions()}"
            )
        drift, vol = _DISTRIBUTION_PARAMS[distribution_type]
        return {
            "distribution_type": distribution_type,
            "daily_drift_pct":      drift * 100,
            "daily_volatility_pct": vol   * 100,
        }

    # ── Private Helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _lognormal_walk(
        size: int,
        start_price: float,
        drift: float,
        volatility: float,
        seed: int,
    ) -> np.ndarray:
        """
        Simulate N price points using a Log-Normal Random Walk.

        Model (GBM discrete approximation):
            log_returns ~ Normal(drift, volatility)   shape: (N-1,)
            prices[0]   = start_price
            prices[i]   = prices[i-1] × exp(log_returns[i-1])

        Clipping at 0.001 prevents edge cases with extremely negative runs,
        though this essentially cannot happen with log-normal (theoretically).
        """
        rng = np.random.default_rng(seed=seed)
        log_returns = rng.normal(loc=drift, scale=volatility, size=size - 1)

        prices = np.empty(size, dtype=np.float64)
        prices[0] = start_price

        # Vectorized cumulative product via exp(cumsum) — O(N)
        prices[1:] = start_price * np.exp(np.cumsum(log_returns))

        # Numerical safety clip (extremely rare, but defensive)
        np.clip(prices, 0.001, None, out=prices)
        return prices

    @staticmethod
    def _validate_params(size: int, distribution_type: str, start_price: float) -> None:
        if not isinstance(size, int) or size < _MIN_SIZE or size > _MAX_SIZE:
            raise ValueError(
                f"size must be an integer in [{_MIN_SIZE:,}, {_MAX_SIZE:,}], got {size}."
            )
        if distribution_type not in _DISTRIBUTION_PARAMS:
            raise ValueError(
                f"Unknown distribution_type '{distribution_type}'. "
                f"Supported: {list(_DISTRIBUTION_PARAMS.keys())}"
            )
        if start_price <= 0:
            raise ValueError(
                f"start_price must be > 0, got {start_price}."
            )


# ── Module-level singleton ─────────────────────────────────────────────────────
dataset_generator = DatasetGenerator()
