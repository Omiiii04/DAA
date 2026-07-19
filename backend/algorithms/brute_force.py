"""
Brute Force Maximum Subarray Algorithm — O(N²).

Exhaustively evaluates every possible (start, end) window in the daily changes
array. Guarantees correctness at the cost of quadratic time complexity.

Academic Motivation:
    This algorithm exists to demonstrate WHY O(N²) becomes infeasible for
    large datasets. At N = 20,000 prices (our enforced limit), it performs
    approximately 200,000,000 additions — taking several seconds even on
    modern hardware. This provides the empirical baseline for the Complexity
    Visualizer in Phase 4.

Algorithm Pseudocode:
    BruteForce(changes[0..M-1]):
        max_sum ← -∞
        for i ← 0 to M-1:
            current_sum ← 0
            for j ← i to M-1:
                current_sum ← current_sum + changes[j]
                if current_sum > max_sum:
                    max_sum ← current_sum
                    best_left ← i, best_right ← j
        return (best_left, best_right, max_sum)

Time Complexity:  O(N²)  — M(M+1)/2 inner loop iterations, M = N-1
Space Complexity: O(1)   — only scalar accumulators (no auxiliary arrays)
"""

import numpy as np

from algorithms.base import AlgorithmStrategy, SubarrayResult


class BruteForceAlgorithm(AlgorithmStrategy):
    """
    O(N²) exhaustive search for the maximum profit window.

    Enforced dataset limit: N ≤ 20,000 (see config.max_brute_force_size).
    Beyond this limit, execution time exceeds acceptable thresholds on
    mid-range hardware (16GB RAM) and risks blocking the event loop.
    """

    @property
    def name(self) -> str:
        return "Brute Force"

    @property
    def time_complexity(self) -> str:
        return "O(N²)"

    @property
    def space_complexity(self) -> str:
        return "O(1)"

    @property
    def max_safe_input_size(self) -> int:
        return 20_000

    def run(self, prices: np.ndarray) -> SubarrayResult:
        """
        Find the maximum profit by trying all O(N²) buy/sell pairs.

        Implementation Note:
            We iterate over the CHANGES array (length M = N-1) rather than
            directly over price pairs. This keeps all three algorithms
            structurally comparable (same problem domain) and avoids an extra
            O(N) outer loop for buy prices.

            Inner accumulation uses a running sum (not re-summing from scratch),
            so the actual work is M*(M+1)/2 additions, not M² multiplications.

        Args:
            prices: 1D numpy array of closing prices (≥ 2 elements).

        Returns:
            SubarrayResult with the first-occurring maximum (leftmost window
            wins all ties due to strict '>' comparator).
        """
        self.validate_input(prices)
        changes: np.ndarray = self.prices_to_changes(prices)
        m: int = len(changes)  # M = N - 1

        max_sum: float = float("-inf")
        best_left: int = 0
        best_right: int = 0

        # ── O(N²) Exhaustive Search ───────────────────────────────────────────
        for i in range(m):
            current_sum: float = 0.0
            for j in range(i, m):
                current_sum += float(changes[j])
                if current_sum > max_sum:
                    max_sum = current_sum
                    best_left = i
                    best_right = j

        # ── Index Mapping: changes → prices ───────────────────────────────────
        # best_left  = buy  position in changes → prices[best_left]   = buy  price
        # best_right = sell position in changes → prices[best_right+1] = sell price
        return SubarrayResult(
            max_profit=max_sum,
            buy_index=best_left,
            sell_index=best_right + 1,
            algorithm_name=self.name,
        )
