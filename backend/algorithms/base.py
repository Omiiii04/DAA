"""
Strategy Pattern — Abstract Base for All Algorithm Implementations.

Every algorithm (Brute Force, Divide & Conquer, Kadane's) is a concrete
subclass of AlgorithmStrategy. This enforces:

    1. A uniform interface:  algorithm.run(prices) → SubarrayResult
    2. Shared validation:    validate_input() is called once, reused by all.
    3. Shared conversion:    prices_to_changes() maps the stock problem to
                             the classical maximum subarray problem.

The `SubarrayResult` dataclass is the immutable result contract shared
between the algorithm engine, benchmark service, cache service, and API layer.

Academic Context:
    The maximum stock profit problem reduces to finding the maximum contiguous
    subarray of daily price changes (CLRS §4.1):
        profit(i, j) = prices[j] - prices[i]  (buy at i, sell at j > i)
                     = sum(changes[i .. j-1])   where changes = np.diff(prices)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

import numpy as np


# ══════════════════════════════════════════════════════════════════════════════
# Result Data Class
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class SubarrayResult:
    """
    Immutable result object returned by every AlgorithmStrategy.

    All index values refer to positions in the ORIGINAL prices array
    (not the derived changes array).

    Attributes:
        max_profit    : Maximum achievable profit — sum of best daily changes.
        buy_index     : Prices array index at which to buy (inclusive).
        sell_index    : Prices array index at which to sell (inclusive).
                        Invariant: sell_index > buy_index (always).
        algorithm_name: Name of the algorithm that produced this result.
        left_sum      : (Divide & Conquer only) Left sub-problem max sum.
        right_sum     : (Divide & Conquer only) Right sub-problem max sum.
        cross_sum     : (Divide & Conquer only) Crossing sub-problem max sum.
                        Used by the Phase 5 animation visualizer.
    """

    max_profit: float
    buy_index: int
    sell_index: int
    algorithm_name: str
    left_sum: Optional[float] = field(default=None)
    right_sum: Optional[float] = field(default=None)
    cross_sum: Optional[float] = field(default=None)

    # ── Convenience Helpers ───────────────────────────────────────────────────

    def buy_price(self, prices: np.ndarray) -> float:
        """Retrieve the actual purchase price from the prices array."""
        return float(prices[self.buy_index])

    def sell_price(self, prices: np.ndarray) -> float:
        """Retrieve the actual sale price from the prices array."""
        return float(prices[self.sell_index])

    def verify_against_prices(self, prices: np.ndarray, tol: float = 1e-6) -> bool:
        """
        Sanity check: sell_price - buy_price ≈ max_profit.

        This will be True for all three algorithms when operating on the same
        prices array. Deviations indicate a bug in index mapping.
        """
        computed = self.sell_price(prices) - self.buy_price(prices)
        return abs(computed - self.max_profit) < tol

    def __repr__(self) -> str:
        return (
            f"SubarrayResult("
            f"algo={self.algorithm_name!r}, "
            f"profit={self.max_profit:.4f}, "
            f"buy={self.buy_index}, sell={self.sell_index})"
        )


# ══════════════════════════════════════════════════════════════════════════════
# Abstract Strategy Base Class
# ══════════════════════════════════════════════════════════════════════════════

class AlgorithmStrategy(ABC):
    """
    Abstract base class enforcing the Strategy Pattern.

    All algorithm implementations inherit from this class and implement `run()`.
    The benchmark service, API layer, and Phase 6 ML hooks interact exclusively
    through this interface — they never reference concrete classes directly.

    Subclasses MUST implement:
        - name             : str  (unique, used as registry key)
        - time_complexity  : str  (Big-O notation string)
        - space_complexity : str  (Big-O notation string)
        - max_safe_input_size : int (hardware safety limit)
        - run(prices)      : SubarrayResult

    Shared methods (do NOT override unless necessary):
        - validate_input(prices) : Raises on bad input
        - prices_to_changes(prices) : np.diff wrapper with float64 cast
    """

    # ── Abstract Properties ───────────────────────────────────────────────────

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique human-readable algorithm name (used as dict/DB key)."""
        ...

    @property
    @abstractmethod
    def time_complexity(self) -> str:
        """Big-O time complexity notation, e.g. 'O(N²)' or 'O(N log N)'."""
        ...

    @property
    @abstractmethod
    def space_complexity(self) -> str:
        """Big-O space complexity notation, e.g. 'O(1)' or 'O(log N)'."""
        ...

    @property
    @abstractmethod
    def max_safe_input_size(self) -> int:
        """
        Maximum input size (N) safe to benchmark on mid-range hardware (16GB RAM).
        Enforced by the BenchmarkRunner before any benchmark is started.
        """
        ...

    # ── Abstract Core Method ──────────────────────────────────────────────────

    @abstractmethod
    def run(self, prices: np.ndarray) -> SubarrayResult:
        """
        Execute the algorithm on a price array.

        Internally converts prices → daily changes, solves the maximum subarray
        problem, then maps indices back to the prices array.

        Args:
            prices: 1D numpy array of stock closing prices (≥ 2 elements).
                    Integer or float dtype — will be cast to float64 internally.

        Returns:
            SubarrayResult with max_profit, buy_index, and sell_index.

        Raises:
            TypeError:  If prices is not a numpy.ndarray.
            ValueError: If prices has fewer than 2 elements.
            ValueError: If prices contains NaN or Inf values.
            ValueError: If prices is not 1-dimensional.
        """
        ...

    # ── Shared Helpers (inherited by all concrete strategies) ─────────────────

    def validate_input(self, prices: np.ndarray) -> None:
        """
        Validate the input array before algorithm execution.

        This is called at the START of every concrete `run()` method.
        All validation errors are raised before any computation begins.

        Raises:
            TypeError:  prices is not a numpy.ndarray.
            ValueError: prices.ndim != 1.
            ValueError: len(prices) < 2.
            ValueError: prices contains NaN or Inf.
        """
        if not isinstance(prices, np.ndarray):
            raise TypeError(
                f"prices must be a numpy.ndarray, got {type(prices).__name__}. "
                "Convert your data with np.array(your_list)."
            )
        if prices.ndim != 1:
            raise ValueError(
                f"prices must be a 1-D array, got shape {prices.shape}. "
                "Flatten your array with prices.flatten()."
            )
        if len(prices) < 2:
            raise ValueError(
                f"prices must have at least 2 elements to compute a profit window, "
                f"got {len(prices)}."
            )
        if not np.all(np.isfinite(prices)):
            raise ValueError(
                "prices array contains NaN or Inf values. "
                "Clean your data before passing it to the algorithm."
            )

    def prices_to_changes(self, prices: np.ndarray) -> np.ndarray:
        """
        Convert a price array to daily change amounts.

        Mapping (CLRS §4.1 reduction):
            changes[i] = prices[i+1] - prices[i]   for i = 0 .. N-2

        This transforms the buy-low-sell-high problem into the classical
        maximum contiguous subarray problem. The optimal solution satisfies:

            buy_index  = left  index of max-sum subarray in changes
            sell_index = right index of max-sum subarray + 1

        Args:
            prices: 1D numpy array of length N.

        Returns:
            1D float64 numpy array of length N-1.
        """
        return np.diff(prices.astype(np.float64))

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"name={self.name!r}, "
            f"T={self.time_complexity}, "
            f"S={self.space_complexity})"
        )
