"""
Experimental Analysis Module — Theoretical vs. Observed Complexity.

Compares THEORETICAL complexity curves against OBSERVED runtime performance
to quantitatively measure how well each algorithm conforms to its Big-O class.

For each algorithm, given (dataset_size, observed_time) pairs:
    1. Compute theoretical values: T_theory(n) = f(n) for the claimed Big-O.
    2. Normalize both curves to the first data point (baseline = 1.0).
    3. Compute consecutive doubling ratios: ratio[i] = time[i] / time[i-1].
    4. Compare observed ratios to theoretical predictions.
    5. Compute a fitness score [0.0, 1.0] measuring curve alignment.

Expected Doubling Ratios (when N doubles: N → 2N):
    O(N)       : ratio ≈ 2.0x
    O(N log N) : ratio ≈ 2.1x  (= 2 × log(2N)/log(N) → 2 + 2/log₂N)
    O(N²)      : ratio ≈ 4.0x

Academic Use:
    Powers the Phase 4 Complexity Visualizer (overlay of theoretical curves
    on empirical data) and the Phase 5 PDF Report analysis section.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from typing import Callable, Optional


# ══════════════════════════════════════════════════════════════════════════════
# Data Classes
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class ComplexityPoint:
    """
    A single data point on the complexity analysis chart.

    Each point represents one (N, observed_time) pair with its corresponding
    theoretical value and growth ratios — used by the Phase 4 chart series.
    """
    dataset_size: int
    observed_time: float             # Seconds (raw measurement)
    theoretical_value: float         # Normalized theoretical value (relative to first)
    normalized_observed: float       # Normalized observed time (relative to first)
    growth_ratio: Optional[float]    # observed[i] / observed[i-1]; None for first point
    theoretical_ratio: Optional[float]  # theoretical[i] / theoretical[i-1]
    ratio_deviation: Optional[float]    # |growth_ratio - theoretical_ratio|


@dataclass
class GrowthAnalysis:
    """
    Complete complexity analysis for one algorithm across multiple N values.

    Attributes:
        algorithm_name   : Algorithm identifier.
        complexity        : Big-O notation string, e.g. 'O(N²)'.
        points            : Per-data-point analysis.
        mean_growth_ratio : Average observed growth ratio across transitions.
        theoretical_mean  : Average theoretical growth ratio (expected value).
        fitness_score     : [0.0, 1.0] — how well observed matches theoretical.
                           1.0 = perfect alignment, 0.0 = completely divergent.
        summary           : Human-readable interpretation for the PDF report.
    """
    algorithm_name: str
    complexity: str
    points: list[ComplexityPoint] = field(default_factory=list)
    mean_growth_ratio:  Optional[float] = None
    theoretical_mean:   Optional[float] = None
    fitness_score:      Optional[float] = None
    summary: str = ""


# ══════════════════════════════════════════════════════════════════════════════
# Supported Complexity Functions
# ══════════════════════════════════════════════════════════════════════════════

_COMPLEXITY_FN: dict[str, Callable[[int], float]] = {
    "O(N)":       lambda n: float(n),
    "O(N log N)": lambda n: float(n * math.log2(n)) if n > 1 else float(n),
    "O(N²)":      lambda n: float(n ** 2),
    "O(N log²N)": lambda n: float(n * (math.log2(n) ** 2)) if n > 1 else float(n),
    "O(N³)":      lambda n: float(n ** 3),
    "O(log N)":   lambda n: float(math.log2(n)) if n > 1 else 0.0,
}


def get_supported_complexities() -> list[str]:
    """Return all complexity notation strings recognized by this module."""
    return list(_COMPLEXITY_FN.keys())


# ══════════════════════════════════════════════════════════════════════════════
# Analyzer
# ══════════════════════════════════════════════════════════════════════════════

class ExperimentalAnalyzer:
    """
    Analyzes the relationship between claimed and observed algorithmic complexity.

    Usage:
        analyzer = ExperimentalAnalyzer()
        result = analyzer.analyze(
            algorithm_name="Brute Force",
            complexity="O(N²)",
            dataset_sizes=[1000, 2000, 5000, 10000, 20000],
            observed_times=[0.001, 0.004, 0.025, 0.100, 0.395],
        )
        print(result.summary)
        print(f"Fitness: {result.fitness_score:.3f}")
    """

    def analyze(
        self,
        algorithm_name: str,
        complexity: str,
        dataset_sizes: list[int],
        observed_times: list[float],
    ) -> GrowthAnalysis:
        """
        Perform complete experimental complexity analysis.

        Args:
            algorithm_name: Human-readable algorithm label.
            complexity:     Big-O string (must be in get_supported_complexities()).
            dataset_sizes:  Sorted list of dataset sizes used in benchmarks.
            observed_times: Corresponding mean execution times (seconds).

        Returns:
            GrowthAnalysis with per-point data, aggregate ratios, and fitness.

        Raises:
            ValueError: If complexity is not recognized.
            ValueError: If dataset_sizes and observed_times differ in length.
            ValueError: If fewer than 2 data points are provided.
        """
        # ── Validation ────────────────────────────────────────────────────────
        if complexity not in _COMPLEXITY_FN:
            raise ValueError(
                f"Unknown complexity '{complexity}'. "
                f"Supported: {get_supported_complexities()}"
            )
        if len(dataset_sizes) != len(observed_times):
            raise ValueError(
                f"dataset_sizes (len={len(dataset_sizes)}) and "
                f"observed_times (len={len(observed_times)}) must have equal length."
            )
        if len(dataset_sizes) < 2:
            raise ValueError(
                "At least 2 data points are required for growth ratio analysis."
            )

        fn = _COMPLEXITY_FN[complexity]

        # ── Compute raw theoretical values ────────────────────────────────────
        raw_theoretical = [fn(n) for n in dataset_sizes]

        # ── Normalize to first data point (= 1.0 baseline) ───────────────────
        base_obs   = observed_times[0]
        base_theo  = raw_theoretical[0]

        norm_obs  = [t / base_obs   for t in observed_times]
        norm_theo = [v / base_theo  for v in raw_theoretical]

        # ── Consecutive growth ratios ─────────────────────────────────────────
        obs_ratios  = self._consecutive_ratios(observed_times)
        theo_ratios = self._consecutive_ratios(raw_theoretical)

        # ── Build per-point ComplexityPoint objects ───────────────────────────
        points: list[ComplexityPoint] = []
        for idx in range(len(dataset_sizes)):
            obs_r  = obs_ratios[idx]
            theo_r = theo_ratios[idx]
            dev = abs(obs_r - theo_r) if (obs_r is not None and theo_r is not None) else None

            points.append(ComplexityPoint(
                dataset_size=dataset_sizes[idx],
                observed_time=observed_times[idx],
                theoretical_value=norm_theo[idx],
                normalized_observed=norm_obs[idx],
                growth_ratio=obs_r,
                theoretical_ratio=theo_r,
                ratio_deviation=dev,
            ))

        # ── Aggregate statistics ──────────────────────────────────────────────
        valid_obs  = [r for r in obs_ratios  if r is not None and math.isfinite(r)]
        valid_theo = [r for r in theo_ratios if r is not None and math.isfinite(r)]

        mean_obs   = statistics.mean(valid_obs)  if valid_obs  else None
        mean_theo  = statistics.mean(valid_theo) if valid_theo else None
        fitness    = self._compute_fitness(valid_obs, valid_theo)
        summary    = self._generate_summary(algorithm_name, complexity, mean_obs, mean_theo, fitness)

        return GrowthAnalysis(
            algorithm_name=algorithm_name,
            complexity=complexity,
            points=points,
            mean_growth_ratio=mean_obs,
            theoretical_mean=mean_theo,
            fitness_score=fitness,
            summary=summary,
        )

    # ── Growth Ratio Helpers ──────────────────────────────────────────────────

    @staticmethod
    def _consecutive_ratios(values: list[float]) -> list[Optional[float]]:
        """
        Compute consecutive ratios: ratio[i] = values[i] / values[i-1].

        First element always returns None (no predecessor).
        Returns None for undefined ratios (zero denominator).
        """
        ratios: list[Optional[float]] = [None]
        for i in range(1, len(values)):
            if values[i - 1] > 0:
                ratios.append(values[i] / values[i - 1])
            else:
                ratios.append(None)
        return ratios

    @staticmethod
    def _compute_fitness(
        observed_ratios: list[float],
        theoretical_ratios: list[float],
    ) -> Optional[float]:
        """
        Compute a [0.0, 1.0] fitness score measuring theoretical alignment.

        Method: Normalized Mean Absolute Error
            fitness = 1 - (mean_absolute_error / reference_scale)

        A score > 0.9 = excellent fit.
        A score < 0.5 = poor fit (algorithm may not follow the claimed complexity).

        Returns None if insufficient data.
        """
        n = min(len(observed_ratios), len(theoretical_ratios))
        if n == 0:
            return None

        errors = [abs(observed_ratios[i] - theoretical_ratios[i]) for i in range(n)]
        mean_error = statistics.mean(errors)
        scale = statistics.mean(theoretical_ratios) if theoretical_ratios else 1.0
        normalized = mean_error / scale if scale > 0 else mean_error
        return round(max(0.0, min(1.0, 1.0 - normalized)), 4)

    @staticmethod
    def _generate_summary(
        algorithm_name: str,
        complexity: str,
        mean_obs: Optional[float],
        mean_theo: Optional[float],
        fitness: Optional[float],
    ) -> str:
        """Generate a human-readable analysis summary for the PDF report."""
        if mean_obs is None or fitness is None:
            return f"{algorithm_name}: Insufficient data for analysis."

        quality = (
            "excellent" if fitness > 0.9
            else "good"  if fitness > 0.7
            else "fair"  if fitness > 0.5
            else "poor"
        )
        direction = (
            "below theoretical prediction (better than expected)"
            if mean_obs < (mean_theo or 0)
            else "above theoretical prediction (worse than expected)"
        )

        return (
            f"{algorithm_name} ({complexity}): "
            f"Mean observed growth ratio = {mean_obs:.3f}x | "
            f"Theoretical = {mean_theo:.3f}x | "
            f"Fitness score = {fitness:.3f} ({quality}). "
            f"Empirical performance runs {direction}."
        )

    # ── Multi-Algorithm Comparison ─────────────────────────────────────────────

    def compare_algorithms(self, analyses: list[GrowthAnalysis]) -> dict:
        """
        Generate a comparative summary across multiple GrowthAnalysis results.

        Returns a JSON-serializable dict suitable for Phase 2 API responses
        and Phase 4 chart data.
        """
        if not analyses:
            return {"algorithms": [], "best_fit": None}

        return {
            "algorithms": [
                {
                    "name":                    a.algorithm_name,
                    "complexity":              a.complexity,
                    "fitness_score":           a.fitness_score,
                    "mean_observed_ratio":     a.mean_growth_ratio,
                    "mean_theoretical_ratio":  a.theoretical_mean,
                    "summary":                 a.summary,
                }
                for a in analyses
            ],
            "best_fit": min(
                analyses,
                key=lambda a: abs((a.fitness_score or 0.0) - 1.0),
            ).algorithm_name,
        }


# ── Module-level singleton ─────────────────────────────────────────────────────
experimental_analyzer = ExperimentalAnalyzer()
