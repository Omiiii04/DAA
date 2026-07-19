"""
Unit Tests — Experimental Analysis Module.

Validates:
    Theoretical complexity functions:
        - O(N²) doubling ratio ≈ 4.0x
        - O(N) doubling ratio = exactly 2.0x
        - O(N log N) doubling ratio between 2.0x and 4.0x

    Growth ratio computation:
        - First point always returns None ratio
        - Exact 2x time produces ratio of 2.0
        - mean_growth_ratio is computed for multi-point datasets

    Fitness score:
        - Bounded [0.0, 1.0]
        - Perfect-fit data scores > 0.95
        - Poor-fit data (wrong complexity claimed) scores < 0.7

    Error handling:
        - Unknown complexity raises ValueError
        - Mismatched array lengths raise ValueError
        - Single data point raises ValueError

    Summary:
        - summary is a non-empty string
        - Contains algorithm name and complexity
"""

import math
import pytest

from services.experimental_analysis import (
    ExperimentalAnalyzer,
    GrowthAnalysis,
    get_supported_complexities,
)


@pytest.fixture(scope="module")
def analyzer():
    return ExperimentalAnalyzer()


# ══════════════════════════════════════════════════════════════════════════════
# Supported Complexities
# ══════════════════════════════════════════════════════════════════════════════

class TestSupportedComplexities:

    def test_returns_list(self):
        result = get_supported_complexities()
        assert isinstance(result, list)

    def test_contains_three_classical_complexities(self):
        supported = get_supported_complexities()
        assert "O(N)" in supported
        assert "O(N log N)" in supported
        assert "O(N²)" in supported


# ══════════════════════════════════════════════════════════════════════════════
# Theoretical Complexity Functions
# ══════════════════════════════════════════════════════════════════════════════

class TestTheoreticalComplexityScaling:

    def test_on_quadratic_doubling_ratio_is_four(self, analyzer):
        """O(N²): when N doubles, theoretical value should be exactly 4x."""
        result = analyzer.analyze(
            "BF", "O(N²)",
            dataset_sizes=[100, 200],
            observed_times=[0.010, 0.040],
        )
        ratio = result.points[1].theoretical_ratio
        assert abs(ratio - 4.0) < 0.001, f"Expected 4.0, got {ratio}"

    def test_on_linear_doubling_ratio_is_two(self, analyzer):
        """O(N): when N doubles, theoretical value should be exactly 2x."""
        result = analyzer.analyze(
            "Kadane", "O(N)",
            dataset_sizes=[1000, 2000],
            observed_times=[0.001, 0.002],
        )
        ratio = result.points[1].theoretical_ratio
        assert abs(ratio - 2.0) < 1e-9

    def test_on_nlogn_ratio_strictly_between_two_and_four(self, analyzer):
        """O(N log N): doubling ratio is between 2 and 4 (slightly above 2)."""
        result = analyzer.analyze(
            "D&C", "O(N log N)",
            dataset_sizes=[1024, 2048],
            observed_times=[0.005, 0.011],
        )
        ratio = result.points[1].theoretical_ratio
        assert 2.0 < ratio < 4.0, f"O(N log N) ratio {ratio} not in (2, 4)"

    def test_quadratic_four_points_all_ratios_four(self, analyzer):
        """All doubling ratios for O(N²) should be ≈4.0."""
        result = analyzer.analyze(
            "BF", "O(N²)",
            dataset_sizes=[100, 200, 400, 800],
            observed_times=[0.001, 0.004, 0.016, 0.064],
        )
        ratios = [p.theoretical_ratio for p in result.points if p.theoretical_ratio is not None]
        for r in ratios:
            assert abs(r - 4.0) < 0.01, f"Expected 4.0, got {r}"


# ══════════════════════════════════════════════════════════════════════════════
# Growth Ratio Computation
# ══════════════════════════════════════════════════════════════════════════════

class TestGrowthRatioComputation:

    def test_first_point_growth_ratio_is_none(self, analyzer):
        result = analyzer.analyze(
            "X", "O(N)",
            dataset_sizes=[100, 200, 400],
            observed_times=[0.001, 0.002, 0.004],
        )
        assert result.points[0].growth_ratio is None
        assert result.points[0].theoretical_ratio is None

    def test_exact_doubling_gives_ratio_two(self, analyzer):
        result = analyzer.analyze(
            "X", "O(N)",
            dataset_sizes=[100, 200],
            observed_times=[0.001, 0.002],
        )
        assert abs(result.points[1].growth_ratio - 2.0) < 1e-9

    def test_mean_growth_ratio_is_computed(self, analyzer):
        result = analyzer.analyze(
            "X", "O(N)",
            dataset_sizes=[100, 200, 400, 800],
            observed_times=[0.001, 0.002, 0.004, 0.008],
        )
        assert result.mean_growth_ratio is not None
        assert abs(result.mean_growth_ratio - 2.0) < 1e-6

    def test_theoretical_mean_is_computed(self, analyzer):
        result = analyzer.analyze(
            "X", "O(N²)",
            dataset_sizes=[100, 200, 400],
            observed_times=[0.001, 0.004, 0.016],
        )
        assert result.theoretical_mean is not None
        assert abs(result.theoretical_mean - 4.0) < 0.01

    def test_ratio_deviation_is_non_negative(self, analyzer):
        result = analyzer.analyze(
            "X", "O(N)",
            dataset_sizes=[100, 200, 400],
            observed_times=[0.001, 0.002, 0.0042],  # Slight noise
        )
        for pt in result.points:
            if pt.ratio_deviation is not None:
                assert pt.ratio_deviation >= 0.0


# ══════════════════════════════════════════════════════════════════════════════
# Fitness Score
# ══════════════════════════════════════════════════════════════════════════════

class TestFitnessScore:

    def test_fitness_is_between_zero_and_one(self, analyzer):
        result = analyzer.analyze(
            "X", "O(N²)",
            dataset_sizes=[100, 200, 400],
            observed_times=[0.001, 0.004, 0.016],
        )
        assert 0.0 <= result.fitness_score <= 1.0

    def test_perfect_quadratic_fit_scores_high(self, analyzer):
        """Perfectly quadratic observed data should score > 0.95."""
        result = analyzer.analyze(
            "BF", "O(N²)",
            dataset_sizes=[100, 200, 400, 800],
            observed_times=[0.001, 0.004, 0.016, 0.064],
        )
        assert result.fitness_score > 0.95, (
            f"Expected fitness > 0.95 for perfect O(N²) data, got {result.fitness_score}"
        )

    def test_perfect_linear_fit_scores_high(self, analyzer):
        """Perfectly linear observed data for O(N) should score > 0.95."""
        result = analyzer.analyze(
            "Kadane", "O(N)",
            dataset_sizes=[1000, 2000, 4000, 8000],
            observed_times=[0.001, 0.002, 0.004, 0.008],
        )
        assert result.fitness_score > 0.95

    def test_wrong_complexity_claimed_scores_low(self, analyzer):
        """
        Linear data claimed as O(N²) should have low fitness.
        O(N²) predicts 4x growth but data shows only 2x → poor match.
        """
        result = analyzer.analyze(
            "X", "O(N²)",
            dataset_sizes=[100, 200, 400, 800],
            observed_times=[0.001, 0.002, 0.004, 0.008],  # Linear, not quadratic
        )
        assert result.fitness_score < 0.7, (
            f"Expected fitness < 0.7 for linear data labeled O(N²), got {result.fitness_score}"
        )

    def test_fitness_is_rounded_to_4_decimal_places(self, analyzer):
        result = analyzer.analyze(
            "X", "O(N)",
            dataset_sizes=[100, 200],
            observed_times=[0.001, 0.002],
        )
        # Check at most 4 decimal places (5th decimal should be 0)
        s = str(result.fitness_score)
        if "." in s:
            decimal_places = len(s.split(".")[1])
            assert decimal_places <= 4


# ══════════════════════════════════════════════════════════════════════════════
# Error Handling
# ══════════════════════════════════════════════════════════════════════════════

class TestErrorHandling:

    def test_unknown_complexity_raises_value_error(self, analyzer):
        with pytest.raises(ValueError, match="Unknown complexity"):
            analyzer.analyze("X", "O(trash)", [100, 200], [0.1, 0.2])

    def test_mismatched_lengths_raises_value_error(self, analyzer):
        with pytest.raises(ValueError, match="equal length"):
            analyzer.analyze("X", "O(N)", [100, 200, 300], [0.1, 0.2])

    def test_single_point_raises_value_error(self, analyzer):
        with pytest.raises(ValueError, match="At least 2"):
            analyzer.analyze("X", "O(N)", [100], [0.1])

    def test_empty_lists_raises_value_error(self, analyzer):
        with pytest.raises(ValueError, match="At least 2"):
            analyzer.analyze("X", "O(N)", [], [])


# ══════════════════════════════════════════════════════════════════════════════
# Summary String
# ══════════════════════════════════════════════════════════════════════════════

class TestSummaryGeneration:

    def test_summary_is_non_empty_string(self, analyzer):
        result = analyzer.analyze(
            "Kadane", "O(N)",
            dataset_sizes=[100, 200, 400],
            observed_times=[0.001, 0.002, 0.004],
        )
        assert isinstance(result.summary, str)
        assert len(result.summary) > 0

    def test_summary_contains_algorithm_name(self, analyzer):
        result = analyzer.analyze(
            "MyAlgorithm", "O(N)",
            dataset_sizes=[100, 200],
            observed_times=[0.001, 0.002],
        )
        assert "MyAlgorithm" in result.summary

    def test_summary_contains_complexity(self, analyzer):
        result = analyzer.analyze(
            "X", "O(N²)",
            dataset_sizes=[100, 200],
            observed_times=[0.001, 0.004],
        )
        assert "O(N²)" in result.summary


# ══════════════════════════════════════════════════════════════════════════════
# GrowthAnalysis Return Type
# ══════════════════════════════════════════════════════════════════════════════

class TestReturnType:

    def test_returns_growth_analysis_instance(self, analyzer):
        result = analyzer.analyze(
            "X", "O(N)",
            dataset_sizes=[100, 200],
            observed_times=[0.001, 0.002],
        )
        assert isinstance(result, GrowthAnalysis)

    def test_points_count_matches_input(self, analyzer):
        result = analyzer.analyze(
            "X", "O(N)",
            dataset_sizes=[100, 200, 400, 800, 1600],
            observed_times=[0.001, 0.002, 0.004, 0.008, 0.016],
        )
        assert len(result.points) == 5

    def test_compare_algorithms_returns_dict(self, analyzer):
        analyses = [
            analyzer.analyze("BF", "O(N²)", [100, 200], [0.010, 0.040]),
            analyzer.analyze("Kadane", "O(N)", [100, 200], [0.001, 0.002]),
        ]
        comparison = analyzer.compare_algorithms(analyses)
        assert isinstance(comparison, dict)
        assert "algorithms" in comparison
        assert "best_fit" in comparison
        assert len(comparison["algorithms"]) == 2
