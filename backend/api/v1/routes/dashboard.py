"""
Dashboard Routes — /api/v1/dashboard

Endpoints:
    GET /dashboard/summary     — Aggregated KPIs (counts, speedups, distribution).
    GET /dashboard/comparison  — Per-dataset algorithm timing side-by-side.
    GET /dashboard/complexity  — Experimental complexity analysis (theory vs observed).

Design:
    All endpoints are read-only DB queries — safe to call frequently.
    Speedup ratios are computed from average benchmark mean_times across ALL
    benchmarked datasets, giving a global estimate rather than per-dataset.

    Complexity endpoint groups BenchmarkResult rows by algorithm, extracts
    (dataset_size, mean_time) pairs, and passes them to ExperimentalAnalyzer
    for doubling-ratio analysis and fitness scoring.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import AnalysisRun, BenchmarkResult, Dataset
from services.experimental_analysis import experimental_analyzer
from algorithms.registry import ALGORITHM_REGISTRY

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

# ── Algorithm complexity mapping (canonical order) ────────────────────────────
_ALGO_COMPLEXITY: dict[str, str] = {
    "Brute Force":          "O(N²)",
    "Divide & Conquer":     "O(N log N)",
    "Kadane's Algorithm":   "O(N)",
}

_ALGO_COLOR: dict[str, str] = {
    "Brute Force":          "#ef4444",
    "Divide & Conquer":     "#f59e0b",
    "Kadane's Algorithm":   "#10b981",
}


# ══════════════════════════════════════════════════════════════════════════════
# GET /dashboard/summary
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/summary",
    summary="Dashboard KPI Summary",
    description=(
        "Aggregated statistics: total dataset/run/benchmark counts, "
        "average per-algorithm timing, speedup ratios, "
        "dataset size distribution, and the 5 most recently created datasets."
    ),
)
def get_summary(db: Session = Depends(get_db)) -> dict:
    """Return dashboard KPIs computed from all DB records."""

    # ── Counts ────────────────────────────────────────────────────────────────
    total_datasets   = db.query(Dataset).count()
    total_analysis   = db.query(AnalysisRun).count()
    total_benchmarks = db.query(BenchmarkResult).count()

    # ── Per-algorithm avg timing ──────────────────────────────────────────────
    rows = (
        db.query(
            BenchmarkResult.algorithm_name,
            func.avg(BenchmarkResult.mean_time).label("avg_mean_s"),
            func.avg(BenchmarkResult.dataset_size).label("avg_size"),
            func.count(BenchmarkResult.id).label("run_count"),
        )
        .group_by(BenchmarkResult.algorithm_name)
        .all()
    )
    algo_stats: dict = {}
    for row in rows:
        algo_stats[row.algorithm_name] = {
            "avg_mean_time_ms":  round(row.avg_mean_s * 1000, 4) if row.avg_mean_s else 0.0,
            "avg_dataset_size":  int(row.avg_size) if row.avg_size else 0,
            "run_count":         row.run_count,
            "complexity":        _ALGO_COMPLEXITY.get(row.algorithm_name, "O(?)"),
            "color":             _ALGO_COLOR.get(row.algorithm_name, "#94a3b8"),
        }

    # ── Speedup ratios ────────────────────────────────────────────────────────
    bf_ms     = algo_stats.get("Brute Force",        {}).get("avg_mean_time_ms", 0)
    dc_ms     = algo_stats.get("Divide & Conquer",   {}).get("avg_mean_time_ms", 0)
    kadane_ms = algo_stats.get("Kadane's Algorithm", {}).get("avg_mean_time_ms", 0)

    speedup_dc     = round(bf_ms / dc_ms,     2) if dc_ms     > 0 else None
    speedup_kadane = round(bf_ms / kadane_ms, 2) if kadane_ms > 0 else None

    # ── Distribution type breakdown ───────────────────────────────────────────
    dist_rows = (
        db.query(Dataset.distribution_type, func.count(Dataset.id).label("count"))
        .group_by(Dataset.distribution_type)
        .all()
    )
    distribution = {
        (row.distribution_type or "uploaded"): row.count for row in dist_rows
    }

    # ── Dataset size histogram (5 buckets) ────────────────────────────────────
    #    Used by the frontend histogram chart
    size_hist = {
        "1K–10K":    db.query(Dataset).filter(Dataset.size >= 1_000,   Dataset.size < 10_000).count(),
        "10K–50K":   db.query(Dataset).filter(Dataset.size >= 10_000,  Dataset.size < 50_000).count(),
        "50K–100K":  db.query(Dataset).filter(Dataset.size >= 50_000,  Dataset.size < 100_000).count(),
        "100K–500K": db.query(Dataset).filter(Dataset.size >= 100_000, Dataset.size < 500_000).count(),
        "500K+":     db.query(Dataset).filter(Dataset.size >= 500_000).count(),
    }

    # ── Latest 5 datasets ─────────────────────────────────────────────────────
    latest_ds = (
        db.query(Dataset)
        .order_by(Dataset.created_at.desc())
        .limit(5)
        .all()
    )
    latest = [
        {
            "id":                d.id,
            "name":              d.name,
            "size":              d.size,
            "distribution_type": d.distribution_type,
            "source":            d.source,
            "is_verified":       d.is_verified,
            "min_price":         d.min_price,
            "max_price":         d.max_price,
            "mean_price":        d.mean_price,
            "created_at":        d.created_at.isoformat() if d.created_at else None,
        }
        for d in latest_ds
    ]

    return {
        "total_datasets":         total_datasets,
        "total_analysis_runs":    total_analysis,
        "total_benchmark_results": total_benchmarks,
        "algorithm_stats":        algo_stats,
        "speedup_dc_vs_bf":       speedup_dc,
        "speedup_kadane_vs_bf":   speedup_kadane,
        "distribution_breakdown": distribution,
        "size_histogram":         size_hist,
        "latest_datasets":        latest,
        "registered_algorithms":  ALGORITHM_REGISTRY.names(),
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET /dashboard/comparison
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/comparison",
    summary="Algorithm Timing Comparison (Per Dataset)",
    description=(
        "Returns benchmark mean_times for all three algorithms side-by-side "
        "for every dataset that has been benchmarked. Sorted by dataset_size. "
        "Used by the Bar/Line comparison chart on the Dashboard."
    ),
)
def get_comparison(db: Session = Depends(get_db)) -> dict:
    """Return per-dataset algorithm timing data for the comparison chart."""

    # ── Fetch all benchmark rows, join dataset ─────────────────────────────────
    results = (
        db.query(BenchmarkResult)
        .order_by(BenchmarkResult.dataset_size.asc())
        .all()
    )

    # ── Group by dataset_id ───────────────────────────────────────────────────
    ds_map: dict[int, dict] = {}
    for row in results:
        ds = db.query(Dataset).filter(Dataset.id == row.dataset_id).first()
        ds_name = ds.name if ds else f"Dataset {row.dataset_id}"

        if row.dataset_id not in ds_map:
            ds_map[row.dataset_id] = {
                "dataset_id":   row.dataset_id,
                "dataset_name": ds_name,
                "dataset_size": row.dataset_size,
            }
        ds_map[row.dataset_id][row.algorithm_name] = {
            "mean_ms":   round(row.mean_time   * 1000, 4),
            "median_ms": round(row.median_time * 1000, 4),
            "min_ms":    round(row.min_time    * 1000, 4),
            "max_ms":    round(row.max_time    * 1000, 4),
            "std_ms":    round(row.std_time    * 1000, 4),
        }

    comparison_data = sorted(ds_map.values(), key=lambda x: x["dataset_size"])

    # ── Global speedups across all comparison points ───────────────────────────
    bf_means = [
        p["Brute Force"]["mean_ms"]
        for p in comparison_data
        if "Brute Force" in p
    ]
    dc_means = [
        p["Divide & Conquer"]["mean_ms"]
        for p in comparison_data
        if "Divide & Conquer" in p
    ]
    kadane_means = [
        p["Kadane's Algorithm"]["mean_ms"]
        for p in comparison_data
        if "Kadane's Algorithm" in p
    ]

    def _safe_speedup(a: list[float], b: list[float]) -> Optional[float]:
        pairs = [(x, y) for x, y in zip(a, b) if y > 0]
        if not pairs:
            return None
        return round(sum(x / y for x, y in pairs) / len(pairs), 2)

    return {
        "has_data":              len(comparison_data) > 0,
        "comparison_data":       comparison_data,
        "avg_speedup_dc_vs_bf":     _safe_speedup(bf_means, dc_means),
        "avg_speedup_kadane_vs_bf": _safe_speedup(bf_means, kadane_means),
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET /dashboard/complexity
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/complexity",
    summary="Experimental Complexity Analysis",
    description=(
        "Groups benchmark results by algorithm and dataset_size, then applies "
        "ExperimentalAnalyzer to compute doubling ratios and fitness scores. "
        "Requires at least 2 distinct dataset sizes benchmarked per algorithm. "
        "Used by the Complexity Visualizer page."
    ),
)
def get_complexity(db: Session = Depends(get_db)) -> dict:
    """Return theory vs. observed complexity data for all algorithms."""

    # ── Fetch all BenchmarkResult rows ────────────────────────────────────────
    rows = (
        db.query(BenchmarkResult)
        .order_by(BenchmarkResult.dataset_size.asc())
        .all()
    )

    if len(rows) < 2:
        return {
            "has_data": False,
            "message": (
                "Run benchmarks on at least 2 datasets of different sizes "
                "to enable complexity analysis."
            ),
            "analyses": {},
        }

    # ── Group by algorithm (de-dup by dataset_size: keep smallest mean_time) ──
    by_algo: dict[str, dict[int, float]] = {}
    for row in rows:
        if row.algorithm_name not in by_algo:
            by_algo[row.algorithm_name] = {}
        size = row.dataset_size
        if size not in by_algo[row.algorithm_name]:
            by_algo[row.algorithm_name][size] = row.mean_time
        else:
            # Use minimum observed time (most optimistic / least noise)
            by_algo[row.algorithm_name][size] = min(
                by_algo[row.algorithm_name][size], row.mean_time
            )

    # ── Run ExperimentalAnalyzer per algorithm ─────────────────────────────────
    analyses: dict = {}
    for algo_name, size_time_map in by_algo.items():
        if len(size_time_map) < 2:
            continue

        complexity = _ALGO_COMPLEXITY.get(algo_name, "O(N)")
        sizes  = sorted(size_time_map.keys())
        times  = [size_time_map[s] for s in sizes]

        try:
            result = experimental_analyzer.analyze(
                algorithm_name=algo_name,
                complexity=complexity,
                dataset_sizes=sizes,
                observed_times=times,
            )
            analyses[algo_name] = {
                "complexity":          complexity,
                "color":               _ALGO_COLOR.get(algo_name, "#94a3b8"),
                "fitness_score":       result.fitness_score,
                "mean_growth_ratio":   result.mean_growth_ratio,
                "theoretical_mean":    result.theoretical_mean,
                "summary":             result.summary,
                "points": [
                    {
                        "dataset_size":       p.dataset_size,
                        "observed_time_ms":   round(p.observed_time * 1000, 4),
                        "theoretical_value":  round(p.theoretical_value, 6),
                        "normalized_observed": round(p.normalized_observed, 6),
                        "growth_ratio":       round(p.growth_ratio, 4) if p.growth_ratio else None,
                        "theoretical_ratio":  round(p.theoretical_ratio, 4) if p.theoretical_ratio else None,
                        "ratio_deviation":    round(p.ratio_deviation, 4) if p.ratio_deviation else None,
                    }
                    for p in result.points
                ],
            }
        except Exception as exc:
            logger.warning("Complexity analysis failed for '%s': %s", algo_name, exc)

    return {
        "has_data": len(analyses) > 0,
        "analyses": analyses,
        "message":  None if analyses else "Insufficient data.",
    }
