"""
Analysis Routes — /api/v1/analyze

Endpoint:
    POST /analyze

Runs all (or selected) algorithms on a price dataset and returns SubarrayResults.

Design:
    - Accepts EITHER a `dataset_id` (load from DB) OR inline `prices` array.
    - Results are compared across algorithms for consistency (verification).
    - For dataset_id requests: results are stored in analysis_runs and cached.
    - CPU-bound algorithm execution runs in asyncio.to_thread to avoid
      blocking the FastAPI event loop.

Caching:
    If all requested algorithms already have analysis_runs in the DB for the
    given dataset_id, those rows are returned directly (cache hit).

Cross-Verification:
    After all algorithms run, max_profit values are compared.
    |profit_A - profit_B| < 1e-6 → verification_passed = True.
    Any disagreement triggers a MISMATCH note in verification_notes.
"""

import asyncio
import logging
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from algorithms.base import AlgorithmStrategy, SubarrayResult
from algorithms.registry import ALGORITHM_REGISTRY
from database.connection import get_db
from database.models import AnalysisRun, Dataset
from models.schemas import AnalyzeRequestSchema, AnalyzeResponseSchema, SubarrayResultSchema

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analyze", tags=["Analysis"])

_PROFIT_TOLERANCE = 1e-6


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _load_prices_from_db(dataset_id: int, db: Session) -> tuple[np.ndarray, Dataset]:
    """Load a Dataset and its .npy price file. Raises 404 on missing."""
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if ds is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset {dataset_id} not found."
        )
    if not ds.data_file_path:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dataset {dataset_id} has no associated price file."
        )
    prices = np.load(ds.data_file_path)
    return prices, ds


def _cached_analysis_runs(
    db: Session,
    dataset_id: int,
    algorithm_names: list[str],
) -> dict[str, AnalysisRun] | None:
    """
    Return existing AnalysisRun rows for all requested algorithms, or None.
    Returns None if any requested algorithm is missing from DB.
    """
    runs = (
        db.query(AnalysisRun)
        .filter(
            AnalysisRun.dataset_id == dataset_id,
            AnalysisRun.algorithm_name.in_(algorithm_names),
        )
        .all()
    )
    run_map = {r.algorithm_name: r for r in runs}
    if all(name in run_map for name in algorithm_names):
        return run_map
    return None


def _run_to_schema(run: AnalysisRun, db_dataset: Dataset) -> SubarrayResultSchema:
    """Convert an ORM AnalysisRun to a SubarrayResultSchema."""
    algo = ALGORITHM_REGISTRY.get(run.algorithm_name)
    return SubarrayResultSchema(
        algorithm_name=run.algorithm_name,
        time_complexity=algo.time_complexity,
        max_profit=run.max_profit,
        buy_index=run.buy_index,
        sell_index=run.sell_index,
        buy_price=run.buy_price,
        sell_price=run.sell_price,
        left_sum=run.left_sum,
        right_sum=run.right_sum,
        cross_sum=run.cross_sum,
    )


def _result_to_schema(result: SubarrayResult, prices: np.ndarray) -> SubarrayResultSchema:
    """Convert an in-memory SubarrayResult to a SubarrayResultSchema."""
    algo = ALGORITHM_REGISTRY.get(result.algorithm_name)
    return SubarrayResultSchema(
        algorithm_name=result.algorithm_name,
        time_complexity=algo.time_complexity,
        max_profit=result.max_profit,
        buy_index=result.buy_index,
        sell_index=result.sell_index,
        buy_price=float(prices[result.buy_index]),
        sell_price=float(prices[result.sell_index]),
        left_sum=result.left_sum,
        right_sum=result.right_sum,
        cross_sum=result.cross_sum,
    )


def _save_analysis_runs(
    db: Session,
    dataset_id: int,
    results: dict[str, SubarrayResult],
    prices: np.ndarray,
) -> None:
    """Persist analysis results to analysis_runs table."""
    for algo_name, result in results.items():
        # Skip if already exists (idempotent insert)
        existing = (
            db.query(AnalysisRun)
            .filter(
                AnalysisRun.dataset_id == dataset_id,
                AnalysisRun.algorithm_name == algo_name,
            )
            .first()
        )
        if existing is not None:
            continue

        run = AnalysisRun(
            dataset_id=dataset_id,
            algorithm_name=algo_name,
            max_profit=result.max_profit,
            buy_index=result.buy_index,
            sell_index=result.sell_index,
            buy_price=float(prices[result.buy_index]),
            sell_price=float(prices[result.sell_index]),
            subarray_type=(
                "left"     if result.left_sum  is not None else
                "right"    if result.right_sum is not None else
                "crossing" if result.cross_sum is not None else None
            ),
            left_sum=result.left_sum,
            right_sum=result.right_sum,
            cross_sum=result.cross_sum,
        )
        db.add(run)
    db.commit()


def _verify_results(
    results: dict[str, SubarrayResultSchema],
    tol: float = _PROFIT_TOLERANCE,
) -> tuple[bool, list[str]]:
    """Cross-verify max_profit values across algorithms."""
    if len(results) < 2:
        return True, ["< 2 algorithms ran — verification skipped."]

    profits = {name: r.max_profit for name, r in results.items()}
    ref_profit = next(iter(profits.values()))
    notes: list[str] = []
    all_match = True

    for name, profit in profits.items():
        if abs(profit - ref_profit) > tol:
            all_match = False
            notes.append(
                f"⚠ MISMATCH: '{name}' profit={profit:.8f} "
                f"vs reference={ref_profit:.8f}"
            )

    if all_match:
        summary = " | ".join(f"{n}: {p:.6f}" for n, p in profits.items())
        notes.append(f"✓ All {len(results)} algorithms agree. [{summary}]")

    return all_match, notes


# ══════════════════════════════════════════════════════════════════════════════
# POST /analyze
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "",
    response_model=AnalyzeResponseSchema,
    status_code=status.HTTP_200_OK,
    summary="Run Algorithm Analysis",
    description=(
        "Run the maximum subarray algorithm(s) on a price dataset.\n\n"
        "Provide **either** `dataset_id` (for a persisted dataset) **or** "
        "an inline `prices` array (not persisted, not cached).\n\n"
        "When `dataset_id` is used, results are cached in `analysis_runs`. "
        "Repeated calls return cached results instantly.\n\n"
        "Algorithm execution runs in a thread pool via `asyncio.to_thread` — "
        "the event loop is never blocked."
    ),
)
async def run_analysis(
    body: AnalyzeRequestSchema,
    db: Session = Depends(get_db),
) -> AnalyzeResponseSchema:
    """Execute algorithms and return SubarrayResults (cached for dataset_id requests)."""

    # ── 1. Resolve algorithm set ──────────────────────────────────────────────
    algo_names: list[str] = body.algorithms or ALGORITHM_REGISTRY.names()
    for name in algo_names:
        if name not in ALGORITHM_REGISTRY:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown algorithm '{name}'. Available: {ALGORITHM_REGISTRY.names()}"
            )

    # ── 2. Load prices ────────────────────────────────────────────────────────
    dataset: Optional[Dataset] = None

    if body.dataset_id is not None:
        prices, dataset = _load_prices_from_db(body.dataset_id, db)

        # ── 3a. Cache check (DB analysis_runs) ───────────────────────────────
        cached_runs = _cached_analysis_runs(db, body.dataset_id, algo_names)
        if cached_runs is not None:
            logger.info(
                "Analysis cache HIT: dataset_id=%d, algos=%s",
                body.dataset_id, algo_names
            )
            result_schemas = {
                name: _run_to_schema(run, dataset)
                for name, run in cached_runs.items()
            }
            verified, notes = _verify_results(result_schemas)
            return AnalyzeResponseSchema(
                dataset_id=body.dataset_id,
                dataset_size=len(prices),
                algorithms_run=algo_names,
                results=result_schemas,
                verification_passed=verified,
                verification_notes=notes,
                cached=True,
            )
    else:
        prices = np.array(body.prices, dtype=np.float64)

    # ── 4. Run algorithms (in thread pool — non-blocking) ─────────────────────
    async def _run_algo(algo: AlgorithmStrategy) -> SubarrayResult:
        return await asyncio.to_thread(algo.run, prices.copy())

    algorithms = [ALGORITHM_REGISTRY.get(name) for name in algo_names]
    results_raw: list[SubarrayResult] = await asyncio.gather(
        *[_run_algo(algo) for algo in algorithms]
    )

    results_map: dict[str, SubarrayResult] = {
        r.algorithm_name: r for r in results_raw
    }

    # ── 5. Build response schemas ─────────────────────────────────────────────
    result_schemas = {
        name: _result_to_schema(result, prices)
        for name, result in results_map.items()
    }

    # ── 6. Persist for dataset_id requests ───────────────────────────────────
    if dataset is not None:
        _save_analysis_runs(db, dataset.id, results_map, prices)

    # ── 7. Cross-verify ───────────────────────────────────────────────────────
    verified, notes = _verify_results(result_schemas)

    return AnalyzeResponseSchema(
        dataset_id=body.dataset_id,
        dataset_size=len(prices),
        algorithms_run=algo_names,
        results=result_schemas,
        verification_passed=verified,
        verification_notes=notes,
        cached=False,
    )
