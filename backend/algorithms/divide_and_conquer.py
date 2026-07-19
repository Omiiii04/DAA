"""
Divide & Conquer Maximum Subarray Algorithm — O(N log N).

Implements the algorithm from CLRS §4.1 (Introduction to Algorithms, 4th Ed.).

Master Theorem Analysis:
    T(n) = 2T(n/2) + Θ(n)
    a=2, b=2, f(n)=Θ(n), n^(log_b a) = n^(log_2 2) = n^1 = Θ(n)
    Case 2: f(n) = Θ(n^(log_b a)) → T(n) = Θ(n log n)

Key Insight — The Crossing Subarray:
    The maximum subarray of A[low..high] must lie in exactly one of:
        (L) Entirely within A[low..mid]           ← recursive sub-problem
        (R) Entirely within A[mid+1..high]        ← recursive sub-problem
        (C) Crossing the midpoint (spanning both) ← solved in Θ(n) by scanning

    FIND-MAX-CROSSING-SUBARRAY exploits this structure by scanning left from
    mid and right from mid+1 independently, then combining — this is the Θ(n)
    "combine" step that drives the recurrence.

Subarray Type Tracking (for Phase 5 Visualizer):
    The algorithm records whether the solution came from the left half, right
    half, or crossing the midpoint. This metadata powers the step-by-step
    animation in the educational module.

Time Complexity:  O(N log N) — by Master Theorem Case 2
Space Complexity: O(log N)  — recursion stack depth (log₂N levels)
"""

import sys
import numpy as np

from algorithms.base import AlgorithmStrategy, SubarrayResult

# Python's default recursion limit is 1000.
# For N=100,000 prices: log₂(99,999) ≈ 17 levels — well within the default.
# Set conservatively higher to handle unusual edge cases.
sys.setrecursionlimit(10_000)


class DivideAndConquerAlgorithm(AlgorithmStrategy):
    """
    O(N log N) maximum subarray via recursive divide & conquer (CLRS §4.1).

    The algorithm divides the changes array at its midpoint, recursively
    solves each half, then finds the best crossing subarray in O(n) time.

    The result includes which of the three sub-cases produced the solution
    (left_sum, right_sum, or cross_sum), used by the Phase 5 visualizer.

    Enforced dataset limit: N ≤ 100,000 (config.max_divide_conquer_size).
    """

    @property
    def name(self) -> str:
        return "Divide & Conquer"

    @property
    def time_complexity(self) -> str:
        return "O(N log N)"

    @property
    def space_complexity(self) -> str:
        return "O(log N)"

    @property
    def max_safe_input_size(self) -> int:
        return 100_000

    # ══════════════════════════════════════════════════════════════════════════
    # CLRS FIND-MAX-CROSSING-SUBARRAY (Θ(n) per level)
    # ══════════════════════════════════════════════════════════════════════════

    def _find_max_crossing_subarray(
        self,
        changes: np.ndarray,
        low: int,
        mid: int,
        high: int,
    ) -> tuple[int, int, float]:
        """
        Find the maximum subarray that crosses the midpoint (CLRS §4.1).

        This is the Θ(n) "combine" step. It:
            1. Scans LEFT  from mid   → low  to find the best left endpoint.
            2. Scans RIGHT from mid+1 → high to find the best right endpoint.
            3. Returns (max_left, max_right, left_sum + right_sum).

        Args:
            changes: The daily changes array.
            low:    Left boundary of the current sub-problem (inclusive).
            mid:    Midpoint index.
            high:   Right boundary of the current sub-problem (inclusive).

        Returns:
            (max_left, max_right, cross_sum) where all indices are in the
            changes array.
        """
        # ── Scan LEFT: find the maximum suffix ending at mid ──────────────────
        left_sum: float = float("-inf")
        total: float = 0.0
        max_left: int = mid

        for i in range(mid, low - 1, -1):
            total += float(changes[i])
            if total > left_sum:
                left_sum = total
                max_left = i

        # ── Scan RIGHT: find the maximum prefix starting at mid+1 ─────────────
        right_sum: float = float("-inf")
        total = 0.0
        max_right: int = mid + 1

        for j in range(mid + 1, high + 1):
            total += float(changes[j])
            if total > right_sum:
                right_sum = total
                max_right = j

        return max_left, max_right, left_sum + right_sum

    # ══════════════════════════════════════════════════════════════════════════
    # CLRS FIND-MAX-SUBARRAY (Recursive)
    # ══════════════════════════════════════════════════════════════════════════

    def _find_max_subarray(
        self,
        changes: np.ndarray,
        low: int,
        high: int,
    ) -> tuple[int, int, float, str]:
        """
        Recursively find the maximum subarray in changes[low..high].

        Recurrence: T(n) = 2T(n/2) + Θ(n) → O(n log n) by Master Theorem.

        Base Case (n=1):
            A single element is its own maximum subarray.

        Recursive Case (n>1):
            Divide at midpoint, solve left and right, find crossing.
            Return the best of three candidates.

        Args:
            changes: Daily changes array.
            low:    Current sub-problem left boundary (inclusive).
            high:   Current sub-problem right boundary (inclusive).

        Returns:
            (left_idx, right_idx, max_sum, subarray_type)
            where subarray_type ∈ {'left', 'right', 'crossing'}
            This metadata is used by the Phase 5 visualizer.
        """
        # ── Base Case: single element ─────────────────────────────────────────
        if high == low:
            return low, high, float(changes[low]), "left"

        # ── Divide ────────────────────────────────────────────────────────────
        mid: int = (low + high) // 2

        # ── Conquer: solve left and right halves recursively ──────────────────
        left_low, left_high, left_sum, _ = self._find_max_subarray(changes, low, mid)
        right_low, right_high, right_sum, _ = self._find_max_subarray(changes, mid + 1, high)

        # ── Combine: find crossing subarray (Θ(n) step) ──────────────────────
        cross_low, cross_high, cross_sum = self._find_max_crossing_subarray(
            changes, low, mid, high
        )

        # ── Return the maximum of the three candidates ────────────────────────
        if left_sum >= right_sum and left_sum >= cross_sum:
            return left_low, left_high, left_sum, "left"
        elif right_sum >= left_sum and right_sum >= cross_sum:
            return right_low, right_high, right_sum, "right"
        else:
            return cross_low, cross_high, cross_sum, "crossing"

    # ══════════════════════════════════════════════════════════════════════════
    # Public Interface
    # ══════════════════════════════════════════════════════════════════════════

    def run(self, prices: np.ndarray) -> SubarrayResult:
        """
        Find the maximum profit via divide & conquer on the changes array.

        The result includes the subarray type (left/right/crossing) and the
        corresponding sum, enabling the Phase 5 step-by-step visualizer to
        reconstruct the recursive decision tree.

        Args:
            prices: 1D numpy array of stock closing prices (≥ 2 elements).

        Returns:
            SubarrayResult with max_profit, buy_index, sell_index.
            Additionally populates left_sum, right_sum, OR cross_sum depending
            on which sub-case produced the global maximum.
        """
        self.validate_input(prices)
        changes: np.ndarray = self.prices_to_changes(prices)
        m: int = len(changes)

        best_left, best_right, max_sum, subarray_type = self._find_max_subarray(
            changes, 0, m - 1
        )

        return SubarrayResult(
            max_profit=max_sum,
            buy_index=best_left,
            sell_index=best_right + 1,
            algorithm_name=self.name,
            # Populate only the winning sub-case field (others remain None)
            left_sum=max_sum if subarray_type == "left" else None,
            right_sum=max_sum if subarray_type == "right" else None,
            cross_sum=max_sum if subarray_type == "crossing" else None,
        )
