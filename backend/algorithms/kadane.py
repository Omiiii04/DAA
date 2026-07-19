"""
Kadane's Algorithm — O(N) Maximum Subarray.

Originally discovered by Joseph Born Kadane (Carnegie Mellon, 1984) via
a probabilistic argument. Later proven optimal — no comparison-based algorithm
can solve the maximum subarray problem faster than O(N).

Key Algorithmic Insight (Greedy Property):
    Let max_ending_here(i) = maximum subarray sum ending EXACTLY at index i.
    Then:
        max_ending_here(i) = max(changes[i], max_ending_here(i-1) + changes[i])

    In plain English: either start a new subarray at i, or extend the best
    subarray ending at i-1. If extending would make the sum negative, discard
    it and start fresh.

    This greedy decision is GLOBALLY optimal — proven via the cut-and-paste
    argument (if a better solution existed, we could paste it in, contradiction).

State Tracked (for Phase 5 Step Visualizer):
    At each step i, the visualizer renders:
        current_sum  : The running candidate sum
        max_sum      : The best seen so far (global maximum)
        temp_left    : The start of the current candidate window

Algorithm Pseudocode:
    Kadane(changes[0..M-1]):
        max_sum ← -∞, current_sum ← 0
        temp_left ← 0, best_left ← 0, best_right ← 0
        for i ← 0 to M-1:
            current_sum ← current_sum + changes[i]
            if current_sum > max_sum:
                max_sum ← current_sum
                best_left ← temp_left, best_right ← i
            if current_sum < 0:
                current_sum ← 0
                temp_left ← i + 1
        return (best_left, best_right, max_sum)

Time Complexity:  O(N)  — single pass over changes array
Space Complexity: O(1)  — only five scalar state variables
"""

import numpy as np

from algorithms.base import AlgorithmStrategy, SubarrayResult


class KadaneAlgorithm(AlgorithmStrategy):
    """
    O(N) maximum subarray via Kadane's single-pass greedy algorithm.

    This is the theoretically optimal algorithm for this problem class.
    Its empirical performance data forms the lower baseline in the Phase 4
    Complexity Visualizer and the O(N) curve in the scaling graph.

    Enforced dataset limit: N ≤ 1,000,000 (config.max_kadane_size).
    (Limited by RAM, not time — 1M float64 prices ≈ 8MB.)
    """

    @property
    def name(self) -> str:
        return "Kadane's Algorithm"

    @property
    def time_complexity(self) -> str:
        return "O(N)"

    @property
    def space_complexity(self) -> str:
        return "O(1)"

    @property
    def max_safe_input_size(self) -> int:
        return 1_000_000

    def run(self, prices: np.ndarray) -> SubarrayResult:
        """
        Find the maximum profit in a single linear pass.

        The algorithm maintains two invariants at each step i:
            1. current_sum = maximum subarray sum ending at position i.
            2. max_sum     = maximum subarray sum seen across all 0..i.

        When current_sum drops below 0, the current window is a net loss.
        Discarding it (resetting to 0) and starting fresh is always correct —
        any extension of a negative-sum prefix can only decrease future sums.

        Args:
            prices: 1D numpy array of stock closing prices (≥ 2 elements).

        Returns:
            SubarrayResult with optimal buy_index and sell_index.
        """
        self.validate_input(prices)
        changes: np.ndarray = self.prices_to_changes(prices)
        m: int = len(changes)

        # ── State variables ───────────────────────────────────────────────────
        max_sum: float = float("-inf")    # Global maximum (answer)
        current_sum: float = 0.0          # Running sum of current window
        best_left: int = 0               # Final answer: buy position
        best_right: int = 0              # Final answer: sell-1 position
        temp_left: int = 0               # Start of current candidate window

        # ── Single pass: O(N) ─────────────────────────────────────────────────
        for i in range(m):
            current_sum += float(changes[i])

            # ── Update global maximum ─────────────────────────────────────────
            if current_sum > max_sum:
                max_sum = current_sum
                best_left = temp_left
                best_right = i

            # ── Greedy reset: discard negative-sum prefix ─────────────────────
            # A negative current_sum means the window [temp_left..i] is a net
            # loss. Any future extension would be better off starting at i+1.
            if current_sum < 0:
                current_sum = 0.0
                temp_left = i + 1

        # ── Index Mapping: changes → prices ───────────────────────────────────
        return SubarrayResult(
            max_profit=max_sum,
            buy_index=best_left,
            sell_index=best_right + 1,
            algorithm_name=self.name,
        )
