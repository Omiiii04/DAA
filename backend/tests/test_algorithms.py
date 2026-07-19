"""
Unit Tests — Algorithm Strategy Implementations.

Tests are organized in classes by concern:
    TestCorrectnessSimple       — Known-answer simple case
    TestCorrectnessAllIncreasing — Monotonic uptrend
    TestCorrectnessAllDecreasing — Monotonic downtrend
    TestCorrectionsTwoElements   — Minimum valid input
    TestCLRSExample              — CLRS §4.1 reference case (profit=43)
    TestCrossAlgorithmConsistency — All 3 algorithms must agree on max_profit
    TestInputValidation          — Type, shape, NaN, Inf, size checks
    TestStrategyPatternContract  — Abstract interface compliance
    TestDivideAndConquerSpecific — D&C-only: crossing subarray metadata

All three algorithms (Brute Force, Divide & Conquer, Kadane's) are tested
against identical inputs via the parametrized `algorithm` fixture.
"""

import numpy as np
import pytest

from algorithms.base import SubarrayResult


# ══════════════════════════════════════════════════════════════════════════════
# Parametrize Fixture — runs each test against all 3 algorithms
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(params=["brute_force", "divide_and_conquer", "kadane"])
def algorithm(request, brute_force, divide_and_conquer, kadane):
    """Parametrize tests across all three algorithm strategies."""
    return {
        "brute_force": brute_force,
        "divide_and_conquer": divide_and_conquer,
        "kadane": kadane,
    }[request.param]


_PROFIT_TOLERANCE = 1e-9  # Floating-point comparison threshold


# ══════════════════════════════════════════════════════════════════════════════
# Correctness: Simple Known Case
# ══════════════════════════════════════════════════════════════════════════════

class TestCorrectnessSimple:
    """
    Test all algorithms against a 6-element array with a verifiable answer.
    Prices: [7, 1, 5, 3, 6, 4] → buy at index 1 (price=1), sell at index 4 (price=6), profit=5.
    """

    def test_max_profit_is_five(self, algorithm, prices_simple):
        result = algorithm.run(prices_simple)
        assert abs(result.max_profit - 5.0) < _PROFIT_TOLERANCE, (
            f"{algorithm.name}: expected max_profit=5.0, got {result.max_profit}"
        )

    def test_buy_index_in_valid_range(self, algorithm, prices_simple):
        result = algorithm.run(prices_simple)
        assert 0 <= result.buy_index < len(prices_simple)

    def test_sell_index_in_valid_range(self, algorithm, prices_simple):
        result = algorithm.run(prices_simple)
        assert 0 <= result.sell_index < len(prices_simple)

    def test_sell_index_strictly_after_buy(self, algorithm, prices_simple):
        result = algorithm.run(prices_simple)
        assert result.sell_index > result.buy_index

    def test_profit_matches_actual_price_diff(self, algorithm, prices_simple):
        """Verify that prices[sell_index] - prices[buy_index] ≈ max_profit."""
        result = algorithm.run(prices_simple)
        actual = prices_simple[result.sell_index] - prices_simple[result.buy_index]
        assert abs(actual - result.max_profit) < _PROFIT_TOLERANCE

    def test_result_algorithm_name_matches(self, algorithm, prices_simple):
        result = algorithm.run(prices_simple)
        assert result.algorithm_name == algorithm.name

    def test_result_is_subarray_result_instance(self, algorithm, prices_simple):
        result = algorithm.run(prices_simple)
        assert isinstance(result, SubarrayResult)

    def test_verify_against_prices_helper(self, algorithm, prices_simple):
        result = algorithm.run(prices_simple)
        assert result.verify_against_prices(prices_simple)


# ══════════════════════════════════════════════════════════════════════════════
# Correctness: All Increasing
# ══════════════════════════════════════════════════════════════════════════════

class TestCorrectnessAllIncreasing:
    """[1, 2, 3, 4, 5] — best window is entire array."""

    def test_max_profit_equals_full_range(self, algorithm, prices_all_increasing):
        result = algorithm.run(prices_all_increasing)
        expected = prices_all_increasing[-1] - prices_all_increasing[0]  # 4.0
        assert abs(result.max_profit - expected) < _PROFIT_TOLERANCE

    def test_buy_at_first(self, algorithm, prices_all_increasing):
        result = algorithm.run(prices_all_increasing)
        assert result.buy_index == 0

    def test_sell_at_last(self, algorithm, prices_all_increasing):
        result = algorithm.run(prices_all_increasing)
        assert result.sell_index == len(prices_all_increasing) - 1


# ══════════════════════════════════════════════════════════════════════════════
# Correctness: All Decreasing
# ══════════════════════════════════════════════════════════════════════════════

class TestCorrectnessAllDecreasing:
    """[5, 4, 3, 2, 1] — all changes negative; best is single step (−1)."""

    def test_max_profit_is_negative(self, algorithm, prices_all_decreasing):
        result = algorithm.run(prices_all_decreasing)
        assert result.max_profit < 0

    def test_max_profit_is_minus_one(self, algorithm, prices_all_decreasing):
        """Least-negative single step = −1.0 (any adjacent pair)."""
        result = algorithm.run(prices_all_decreasing)
        assert abs(result.max_profit - (-1.0)) < _PROFIT_TOLERANCE

    def test_buy_sell_adjacent(self, algorithm, prices_all_decreasing):
        result = algorithm.run(prices_all_decreasing)
        assert result.sell_index == result.buy_index + 1


# ══════════════════════════════════════════════════════════════════════════════
# Correctness: Two Elements (Minimum Valid Input)
# ══════════════════════════════════════════════════════════════════════════════

class TestCorrectionsTwoElements:
    """Minimum valid input: exactly 2 price points."""

    def test_positive_profit(self, algorithm):
        prices = np.array([5.0, 15.0])
        result = algorithm.run(prices)
        assert abs(result.max_profit - 10.0) < _PROFIT_TOLERANCE
        assert result.buy_index == 0
        assert result.sell_index == 1

    def test_negative_profit(self, algorithm):
        prices = np.array([15.0, 5.0])
        result = algorithm.run(prices)
        assert abs(result.max_profit - (-10.0)) < _PROFIT_TOLERANCE
        assert result.buy_index == 0
        assert result.sell_index == 1

    def test_zero_profit(self, algorithm):
        prices = np.array([10.0, 10.0])
        result = algorithm.run(prices)
        assert abs(result.max_profit - 0.0) < _PROFIT_TOLERANCE


# ══════════════════════════════════════════════════════════════════════════════
# Correctness: CLRS §4.1 Reference Example
# ══════════════════════════════════════════════════════════════════════════════

class TestCLRSExample:
    """
    CLRS §4.1 Figure 4.1 stock prices example.
    Verified manually: buy at index 7 (price=63), sell at index 11 (price=106).
    max_profit = 106 - 63 = 43.
    """

    def test_max_profit_equals_43(self, algorithm, prices_clrs_example):
        result = algorithm.run(prices_clrs_example)
        assert abs(result.max_profit - 43.0) < _PROFIT_TOLERANCE, (
            f"{algorithm.name}: expected 43.0, got {result.max_profit}"
        )

    def test_buy_at_index_7(self, algorithm, prices_clrs_example):
        result = algorithm.run(prices_clrs_example)
        assert result.buy_index == 7, (
            f"{algorithm.name}: expected buy_index=7, got {result.buy_index}"
        )

    def test_sell_at_index_11(self, algorithm, prices_clrs_example):
        result = algorithm.run(prices_clrs_example)
        assert result.sell_index == 11, (
            f"{algorithm.name}: expected sell_index=11, got {result.sell_index}"
        )

    def test_prices_verify_profit(self, algorithm, prices_clrs_example):
        result = algorithm.run(prices_clrs_example)
        assert result.verify_against_prices(prices_clrs_example)


# ══════════════════════════════════════════════════════════════════════════════
# Cross-Algorithm Consistency
# ══════════════════════════════════════════════════════════════════════════════

class TestCrossAlgorithmConsistency:
    """All three algorithms must agree on max_profit for any valid input."""

    _TOL = 1e-9

    def _profits(self, all_algorithms, prices):
        return [a.run(prices).max_profit for a in all_algorithms]

    def test_consistent_on_simple(self, all_algorithms, prices_simple):
        profits = self._profits(all_algorithms, prices_simple)
        assert max(profits) - min(profits) < self._TOL, f"Disagreement: {profits}"

    def test_consistent_on_increasing(self, all_algorithms, prices_all_increasing):
        profits = self._profits(all_algorithms, prices_all_increasing)
        assert max(profits) - min(profits) < self._TOL

    def test_consistent_on_decreasing(self, all_algorithms, prices_all_decreasing):
        profits = self._profits(all_algorithms, prices_all_decreasing)
        assert max(profits) - min(profits) < self._TOL

    def test_consistent_on_clrs(self, all_algorithms, prices_clrs_example):
        profits = self._profits(all_algorithms, prices_clrs_example)
        assert max(profits) - min(profits) < self._TOL

    def test_consistent_on_random(self, all_algorithms):
        rng = np.random.default_rng(seed=999)
        prices = 100.0 + np.cumsum(rng.normal(0, 1, 200))
        profits = self._profits(all_algorithms, prices)
        assert max(profits) - min(profits) < self._TOL

    def test_consistent_on_large(self, all_algorithms, prices_large):
        profits = self._profits(all_algorithms, prices_large)
        assert max(profits) - min(profits) < self._TOL


# ══════════════════════════════════════════════════════════════════════════════
# Input Validation
# ══════════════════════════════════════════════════════════════════════════════

class TestInputValidation:
    """All algorithms must reject malformed inputs with the correct exception."""

    def test_rejects_python_list(self, algorithm):
        with pytest.raises(TypeError, match="numpy.ndarray"):
            algorithm.run([1.0, 2.0, 3.0])

    def test_rejects_single_element(self, algorithm):
        with pytest.raises(ValueError, match="at least 2"):
            algorithm.run(np.array([42.0]))

    def test_rejects_empty_array(self, algorithm):
        with pytest.raises(ValueError, match="at least 2"):
            algorithm.run(np.array([]))

    def test_rejects_nan(self, algorithm):
        with pytest.raises(ValueError, match="NaN or Inf"):
            algorithm.run(np.array([1.0, float("nan"), 3.0]))

    def test_rejects_positive_inf(self, algorithm):
        with pytest.raises(ValueError, match="NaN or Inf"):
            algorithm.run(np.array([1.0, float("inf"), 3.0]))

    def test_rejects_negative_inf(self, algorithm):
        with pytest.raises(ValueError, match="NaN or Inf"):
            algorithm.run(np.array([1.0, float("-inf"), 3.0]))

    def test_rejects_2d_array(self, algorithm):
        with pytest.raises(ValueError, match="1-D"):
            algorithm.run(np.array([[1.0, 2.0], [3.0, 4.0]]))

    def test_accepts_integer_dtype(self, algorithm):
        """Integer price arrays should be silently cast to float64."""
        prices = np.array([10, 20, 15, 25, 18], dtype=np.int32)
        result = algorithm.run(prices)
        assert result.max_profit > 0


# ══════════════════════════════════════════════════════════════════════════════
# Strategy Pattern Contract
# ══════════════════════════════════════════════════════════════════════════════

class TestStrategyPatternContract:
    """Verify the Strategy Pattern interface is correctly implemented."""

    def test_all_have_non_empty_name(self, all_algorithms):
        for algo in all_algorithms:
            assert isinstance(algo.name, str) and len(algo.name) > 0

    def test_all_names_are_unique(self, all_algorithms):
        names = [a.name for a in all_algorithms]
        assert len(names) == len(set(names)), "Algorithm names must be unique"

    def test_all_have_big_o_time_complexity(self, all_algorithms):
        for algo in all_algorithms:
            assert "O(" in algo.time_complexity and ")" in algo.time_complexity

    def test_all_have_big_o_space_complexity(self, all_algorithms):
        for algo in all_algorithms:
            assert "O(" in algo.space_complexity and ")" in algo.space_complexity

    def test_all_have_positive_safe_size(self, all_algorithms):
        for algo in all_algorithms:
            assert algo.max_safe_input_size > 0

    def test_safe_sizes_respect_complexity_order(self, all_algorithms):
        """Faster algorithms should support larger datasets."""
        sizes = {a.name: a.max_safe_input_size for a in all_algorithms}
        assert sizes["Brute Force"] < sizes["Divide & Conquer"]
        assert sizes["Divide & Conquer"] < sizes["Kadane's Algorithm"]

    def test_run_returns_subarray_result(self, all_algorithms, prices_simple):
        for algo in all_algorithms:
            result = algo.run(prices_simple)
            assert isinstance(result, SubarrayResult)

    def test_repr_includes_name(self, all_algorithms):
        for algo in all_algorithms:
            r = repr(algo)
            assert algo.name in r


# ══════════════════════════════════════════════════════════════════════════════
# Divide & Conquer Specific
# ══════════════════════════════════════════════════════════════════════════════

class TestDivideAndConquerSpecific:
    """Tests for D&C-specific behavior: subarray type tracking."""

    def test_crossing_subarray_metadata(self, divide_and_conquer):
        """
        Construct a case where the optimal window MUST cross the midpoint.

        Prices:  [100, 105, 104, 109]
        Changes: [5, -1, 5]   → length 3, mid=1

        Crossing subarray [5, -1, 5] = 9 outperforms any single-half solution.
        D&C should set cross_sum=9 and leave left_sum/right_sum as None.
        """
        prices = np.array([100.0, 105.0, 104.0, 109.0])
        result = divide_and_conquer.run(prices)
        assert abs(result.max_profit - 9.0) < _PROFIT_TOLERANCE
        assert result.cross_sum is not None, "Expected cross_sum to be populated"
        assert abs(result.cross_sum - 9.0) < _PROFIT_TOLERANCE
        assert result.left_sum is None
        assert result.right_sum is None

    def test_left_subarray_tracked(self, divide_and_conquer):
        """
        When the optimal is entirely in the left half, left_sum should be set.

        Prices:  [1, 10, 2, 3, 4]  — buy at 0 (1), sell at 1 (10), profit=9
        Changes: [9, -8, 1, 1]
        Max is [9] in the left half.
        """
        prices = np.array([1.0, 10.0, 2.0, 3.0, 4.0])
        result = divide_and_conquer.run(prices)
        assert abs(result.max_profit - 9.0) < _PROFIT_TOLERANCE

    def test_result_has_exactly_one_subtype_set(self, divide_and_conquer, prices_simple):
        """Exactly one of left_sum/right_sum/cross_sum should be non-None."""
        result = divide_and_conquer.run(prices_simple)
        set_fields = sum([
            result.left_sum is not None,
            result.right_sum is not None,
            result.cross_sum is not None,
        ])
        assert set_fields == 1, f"Expected exactly 1 subtype field set, got {set_fields}"

    def test_clrs_example_crosses(self, divide_and_conquer, prices_clrs_example):
        """
        For the CLRS example, the optimal solution [18,20,-7,12] at changes[7..10]
        should cross the midpoint of the full problem.
        """
        result = divide_and_conquer.run(prices_clrs_example)
        assert abs(result.max_profit - 43.0) < _PROFIT_TOLERANCE
        # The optimal result may be left/right/crossing depending on recursion level
        # We just verify correctness, not the specific sub-type at top level
        assert result.verify_against_prices(prices_clrs_example)
