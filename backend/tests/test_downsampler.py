"""
Unit Tests — LTTB Downsampler Service.

Validates:
    Boundary Conditions:
        - N ≤ threshold → identity passthrough (no downsampling)
        - N = threshold → identity passthrough
        - threshold = 2 → only first and last points selected

    Output Properties:
        - Output length equals threshold exactly
        - First and last points always preserved
        - All selected indices are unique
        - Indices are strictly monotonically increasing
        - All indices are valid (0 ≤ index < N)
        - All returned prices match original prices[selected_indices]

    Visual Fidelity:
        - Extreme peaks are preserved in downsampled output
        - Monotonic data's boundary values are preserved

    Error Handling:
        - threshold < 2 raises ValueError
        - 2D array raises ValueError

    Performance:
        - N=1,000,000 → 5,000 points completes within 5 seconds
"""

import time

import numpy as np
import pytest

from services.downsampler import DownsampleResult, lttb_downsample, lttb_or_passthrough


# ══════════════════════════════════════════════════════════════════════════════
# Passthrough (N ≤ threshold)
# ══════════════════════════════════════════════════════════════════════════════

class TestPassthrough:

    def test_small_array_no_downsampling(self):
        prices = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        result = lttb_or_passthrough(prices, threshold=10)
        assert result.is_downsampled is False

    def test_equal_size_no_downsampling(self):
        prices = np.arange(100, dtype=np.float64)
        result = lttb_or_passthrough(prices, threshold=100)
        assert result.is_downsampled is False
        assert len(result.downsampled_prices) == 100

    def test_passthrough_prices_match_original(self):
        prices = np.array([10.0, 20.0, 15.0, 25.0])
        result = lttb_or_passthrough(prices, threshold=10)
        np.testing.assert_array_almost_equal(result.downsampled_prices, prices)

    def test_passthrough_indices_are_identity(self):
        prices = np.array([1.0, 2.0, 3.0])
        result = lttb_or_passthrough(prices, threshold=10)
        expected = np.arange(3, dtype=np.int64)
        np.testing.assert_array_equal(result.selected_indices, expected)

    def test_passthrough_original_size_matches(self):
        prices = np.arange(50, dtype=np.float64)
        result = lttb_or_passthrough(prices, threshold=100)
        assert result.original_size == 50
        assert result.returned_size == 50


# ══════════════════════════════════════════════════════════════════════════════
# Downsampling Output Properties
# ══════════════════════════════════════════════════════════════════════════════

class TestOutputProperties:

    @pytest.fixture
    def prices_large(self):
        rng = np.random.default_rng(42)
        return 100.0 + np.cumsum(rng.normal(0, 1, 50_000))

    def test_output_length_equals_threshold(self, prices_large):
        result = lttb_downsample(prices_large, threshold=500)
        assert len(result.downsampled_prices) == 500
        assert len(result.selected_indices) == 500

    def test_first_point_preserved(self, prices_large):
        result = lttb_downsample(prices_large, threshold=500)
        assert result.selected_indices[0] == 0
        assert abs(result.downsampled_prices[0] - prices_large[0]) < 1e-9

    def test_last_point_preserved(self, prices_large):
        result = lttb_downsample(prices_large, threshold=500)
        n = len(prices_large)
        assert result.selected_indices[-1] == n - 1
        assert abs(result.downsampled_prices[-1] - prices_large[-1]) < 1e-9

    def test_indices_are_strictly_monotonic(self, prices_large):
        result = lttb_downsample(prices_large, threshold=200)
        diffs = np.diff(result.selected_indices)
        assert np.all(diffs > 0), "Selected indices must be strictly increasing"

    def test_indices_are_unique(self, prices_large):
        result = lttb_downsample(prices_large, threshold=300)
        assert len(np.unique(result.selected_indices)) == 300

    def test_all_indices_in_valid_range(self, prices_large):
        result = lttb_downsample(prices_large, threshold=200)
        n = len(prices_large)
        assert np.all(result.selected_indices >= 0)
        assert np.all(result.selected_indices < n)

    def test_prices_match_original_at_indices(self, prices_large):
        result = lttb_downsample(prices_large, threshold=500)
        np.testing.assert_array_almost_equal(
            result.downsampled_prices,
            prices_large[result.selected_indices]
        )

    def test_returned_size_field_correct(self, prices_large):
        result = lttb_downsample(prices_large, threshold=500)
        assert result.returned_size == 500
        assert result.original_size == len(prices_large)

    def test_is_downsampled_true(self, prices_large):
        result = lttb_downsample(prices_large, threshold=500)
        assert result.is_downsampled is True

    @pytest.mark.parametrize("threshold", [2, 10, 100, 1_000])
    def test_various_thresholds(self, prices_large, threshold):
        result = lttb_downsample(prices_large, threshold=threshold)
        assert len(result.downsampled_prices) == threshold


# ══════════════════════════════════════════════════════════════════════════════
# Threshold = 2 (boundary case)
# ══════════════════════════════════════════════════════════════════════════════

class TestThresholdTwo:

    def test_threshold_2_returns_first_and_last(self):
        prices = np.array([5.0, 1.0, 10.0, 2.0, 8.0, 3.0])
        result = lttb_downsample(prices, threshold=2)
        assert result.selected_indices[0] == 0
        assert result.selected_indices[-1] == 5
        assert len(result.downsampled_prices) == 2


# ══════════════════════════════════════════════════════════════════════════════
# Peak Preservation (Visual Fidelity)
# ══════════════════════════════════════════════════════════════════════════════

class TestVisualFidelity:

    def test_extreme_peak_preserved(self):
        """
        A single extreme spike should be captured by LTTB.

        Prices: flat at 100, one extreme peak at 1000, flat again.
        LTTB must select the spike because it creates the largest triangle.
        """
        n = 10_000
        prices = np.ones(n) * 100.0
        peak_idx = n // 2
        prices[peak_idx] = 1_000.0

        result = lttb_downsample(prices, threshold=100)
        assert peak_idx in result.selected_indices, (
            f"Extreme peak at index {peak_idx} was not selected by LTTB"
        )

    def test_monotonic_data_boundaries_preserved(self):
        """For monotonically increasing data, start and end must be selected."""
        prices = np.linspace(10.0, 100.0, 50_000)
        result = lttb_downsample(prices, threshold=500)
        assert result.selected_indices[0] == 0
        assert result.selected_indices[-1] == len(prices) - 1


# ══════════════════════════════════════════════════════════════════════════════
# Error Handling
# ══════════════════════════════════════════════════════════════════════════════

class TestErrorHandling:

    def test_threshold_one_raises(self):
        with pytest.raises(ValueError, match="threshold must be"):
            lttb_downsample(np.ones(100), threshold=1)

    def test_threshold_zero_raises(self):
        with pytest.raises(ValueError, match="threshold must be"):
            lttb_downsample(np.ones(100), threshold=0)

    def test_2d_array_raises(self):
        with pytest.raises(ValueError, match="1-D"):
            lttb_downsample(np.ones((100, 2)), threshold=10)

    def test_or_passthrough_threshold_zero_raises_on_downsample(self):
        """lttb_or_passthrough with N>threshold=1 should raise inside lttb_downsample."""
        prices = np.ones(100)
        with pytest.raises(ValueError):
            lttb_or_passthrough(prices, threshold=1)


# ══════════════════════════════════════════════════════════════════════════════
# Performance
# ══════════════════════════════════════════════════════════════════════════════

class TestPerformance:

    def test_one_million_downsampled_in_five_seconds(self):
        """LTTB on N=1M with threshold=5000 must complete in < 5 seconds."""
        rng = np.random.default_rng(0)
        prices = 100.0 + np.cumsum(rng.normal(0, 1, 1_000_000))

        t_start = time.perf_counter()
        result = lttb_or_passthrough(prices, threshold=5_000)
        elapsed = time.perf_counter() - t_start

        assert len(result.downsampled_prices) == 5_000
        assert elapsed < 5.0, (
            f"LTTB 1M→5K took {elapsed:.2f}s (limit: 5s)"
        )
