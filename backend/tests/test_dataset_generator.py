"""
Unit Tests — DatasetGenerator Service.

Validates:
    Price Array Properties:
        - Correct length (N)
        - All prices > 0 (log-normal guarantee)
        - No NaN or Inf values
        - Correct starting price

    Reproducibility:
        - Same seed → same prices (determinism)
        - Different seeds → different prices

    Distribution Profiles:
        - mostly_positive has higher mean return than mostly_negative
        - high_volatility has higher std than low_volatility

    Input Validation:
        - Size below minimum raises ValueError
        - Size above maximum raises ValueError
        - Unknown distribution_type raises ValueError
        - Negative start_price raises ValueError

    API Contract:
        - GeneratedDataset fields are all present and finite
        - min_price ≤ mean_price ≤ max_price
"""

import numpy as np
import pytest

from services.dataset_generator import DatasetGenerator, GeneratedDataset, dataset_generator


@pytest.fixture(scope="module")
def gen() -> DatasetGenerator:
    return DatasetGenerator()


# ══════════════════════════════════════════════════════════════════════════════
# Price Array Properties
# ══════════════════════════════════════════════════════════════════════════════

class TestPriceArrayProperties:

    @pytest.mark.parametrize("size", [1_000, 10_000, 100_000])
    def test_correct_length(self, gen, size):
        result = gen.generate(size=size, seed=1)
        assert len(result.prices) == size

    def test_all_prices_positive(self, gen):
        result = gen.generate(size=5_000, seed=42)
        assert np.all(result.prices > 0), "Log-normal walk should never go ≤ 0"

    def test_no_nan_or_inf(self, gen):
        result = gen.generate(size=5_000, seed=42)
        assert np.all(np.isfinite(result.prices))

    def test_starts_at_start_price(self, gen):
        result = gen.generate(size=1_000, start_price=250.0, seed=7)
        assert abs(result.prices[0] - 250.0) < 1e-9

    def test_returns_float64(self, gen):
        result = gen.generate(size=1_000, seed=1)
        assert result.prices.dtype == np.float64

    def test_returns_1d_array(self, gen):
        result = gen.generate(size=1_000, seed=1)
        assert result.prices.ndim == 1


# ══════════════════════════════════════════════════════════════════════════════
# Reproducibility
# ══════════════════════════════════════════════════════════════════════════════

class TestReproducibility:

    def test_same_seed_same_prices(self, gen):
        a = gen.generate(size=2_000, seed=123)
        b = gen.generate(size=2_000, seed=123)
        np.testing.assert_array_equal(a.prices, b.prices)

    def test_different_seeds_different_prices(self, gen):
        a = gen.generate(size=2_000, seed=1)
        b = gen.generate(size=2_000, seed=2)
        assert not np.array_equal(a.prices, b.prices)

    def test_none_seed_is_random(self, gen):
        a = gen.generate(size=1_000, seed=None)
        b = gen.generate(size=1_000, seed=None)
        # With overwhelming probability, two random seeds differ
        # (2^31 possible seeds → probability of collision ≈ 4.6e-10)
        assert not np.array_equal(a.prices, b.prices)

    def test_none_seed_stores_a_seed(self, gen):
        result = gen.generate(size=1_000, seed=None)
        assert isinstance(result.seed, int)
        assert result.seed >= 0


# ══════════════════════════════════════════════════════════════════════════════
# Distribution Profiles
# ══════════════════════════════════════════════════════════════════════════════

class TestDistributionProfiles:

    def test_mostly_positive_has_positive_trend(self, gen):
        """Over 100K steps, mostly_positive should have a mean positive log-return."""
        result = gen.generate(size=100_000, distribution_type="mostly_positive", seed=0)
        # Start = 100, so if trend is positive, end should likely exceed 100
        # This is probabilistic but very reliable at N=100K
        log_return = np.log(result.prices[-1] / result.prices[0])
        assert log_return > 0, f"Expected positive trend, got log_return={log_return:.4f}"

    def test_mostly_negative_has_negative_trend(self, gen):
        result = gen.generate(size=100_000, distribution_type="mostly_negative", seed=0)
        log_return = np.log(result.prices[-1] / result.prices[0])
        assert log_return < 0, f"Expected negative trend, got log_return={log_return:.4f}"

    def test_high_volatility_greater_std_than_low(self, gen):
        high = gen.generate(size=50_000, distribution_type="high_volatility", seed=42)
        low  = gen.generate(size=50_000, distribution_type="low_volatility",  seed=42)
        # Compute daily log-returns std
        high_returns_std = np.std(np.log(high.prices[1:] / high.prices[:-1]))
        low_returns_std  = np.std(np.log(low.prices[1:]  / low.prices[:-1]))
        assert high_returns_std > low_returns_std, (
            f"high={high_returns_std:.5f}, low={low_returns_std:.5f}"
        )

    def test_random_near_zero_drift(self, gen):
        """Random walk should have near-zero log-return over many runs on average."""
        # Check that the mean of returns is approximately zero
        result = gen.generate(size=100_000, distribution_type="random", seed=0)
        log_returns = np.log(result.prices[1:] / result.prices[:-1])
        assert abs(np.mean(log_returns)) < 0.01  # Mean within 1% of zero

    def test_all_distributions_complete(self, gen):
        for dist in gen.supported_distributions():
            result = gen.generate(size=1_000, distribution_type=dist, seed=1)
            assert len(result.prices) == 1_000
            assert np.all(np.isfinite(result.prices))


# ══════════════════════════════════════════════════════════════════════════════
# Input Validation
# ══════════════════════════════════════════════════════════════════════════════

class TestInputValidation:

    def test_size_below_minimum_raises(self, gen):
        with pytest.raises(ValueError, match="1,000"):
            gen.generate(size=999)

    def test_size_above_maximum_raises(self, gen):
        with pytest.raises(ValueError, match="1,000,000"):
            gen.generate(size=1_000_001)

    def test_unknown_distribution_raises(self, gen):
        with pytest.raises(ValueError, match="Unknown distribution"):
            gen.generate(size=1_000, distribution_type="magic")

    def test_zero_start_price_raises(self, gen):
        with pytest.raises(ValueError, match="start_price must be > 0"):
            gen.generate(size=1_000, start_price=0.0)

    def test_negative_start_price_raises(self, gen):
        with pytest.raises(ValueError, match="start_price must be > 0"):
            gen.generate(size=1_000, start_price=-50.0)


# ══════════════════════════════════════════════════════════════════════════════
# GeneratedDataset Fields
# ══════════════════════════════════════════════════════════════════════════════

class TestGeneratedDatasetFields:

    def test_returns_generated_dataset_instance(self, gen):
        result = gen.generate(size=1_000, seed=1)
        assert isinstance(result, GeneratedDataset)

    def test_stats_are_finite(self, gen):
        result = gen.generate(size=1_000, seed=1)
        assert np.isfinite(result.min_price)
        assert np.isfinite(result.max_price)
        assert np.isfinite(result.mean_price)
        assert np.isfinite(result.std_price)

    def test_min_le_mean_le_max(self, gen):
        result = gen.generate(size=5_000, seed=99)
        assert result.min_price <= result.mean_price <= result.max_price

    def test_std_is_non_negative(self, gen):
        result = gen.generate(size=1_000, seed=1)
        assert result.std_price >= 0.0

    def test_stats_match_prices_array(self, gen):
        result = gen.generate(size=5_000, seed=5)
        assert abs(result.min_price  - float(np.min(result.prices)))  < 1e-9
        assert abs(result.max_price  - float(np.max(result.prices)))  < 1e-9
        assert abs(result.mean_price - float(np.mean(result.prices))) < 1e-9

    def test_distribution_type_field_matches(self, gen):
        result = gen.generate(size=1_000, distribution_type="mostly_positive", seed=1)
        assert result.distribution_type == "mostly_positive"

    def test_distribution_description_returns_dict(self, gen):
        desc = gen.distribution_description("high_volatility")
        assert "daily_drift_pct" in desc
        assert "daily_volatility_pct" in desc
        assert desc["daily_volatility_pct"] > 0

    def test_module_level_singleton_works(self):
        result = dataset_generator.generate(size=1_000, seed=42)
        assert isinstance(result, GeneratedDataset)
