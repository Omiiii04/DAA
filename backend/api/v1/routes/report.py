"""
PDF Report Routes — Phase 5.

GET /report/dataset/{dataset_id}
    Returns the generated PDF as an attachment (application/pdf).
    Includes all analysis runs, benchmark results, and complexity analysis.

GET /report/datasets
    Returns a list of datasets that have at least one analysis or benchmark result,
    i.e., datasets for which a meaningful report can be generated.
"""

import logging
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import AnalysisRun, BenchmarkResult, Dataset
from services.report_generator import report_generator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/report", tags=["PDF Reports"])


# ══════════════════════════════════════════════════════════════════════════════
# GET /report/dataset/{dataset_id}
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/dataset/{dataset_id}",
    summary="Generate PDF Report for Dataset",
    description=(
        "Generates a comprehensive PDF report for the specified dataset, including: "
        "price series chart, algorithm results table, benchmark statistics, "
        "empirical complexity analysis, and academic conclusions. "
        "Returns the PDF as a downloadable attachment."
    ),
    responses={
        200: {
            "content": {"application/pdf": {}},
            "description": "PDF report file",
        },
        404: {"description": "Dataset not found or no data available"},
    },
)
def generate_dataset_report(
    dataset_id: int,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Generate and stream a PDF report for the given dataset_id."""
    try:
        pdf_bytes = report_generator.generate(dataset_id=dataset_id, db=db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("PDF generation failed for dataset %d: %s", dataset_id, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Report generation failed: {str(exc)[:200]}",
        )

    filename = f"peak_analyzer_report_dataset_{dataset_id}.pdf"

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length":      str(len(pdf_bytes)),
            "X-Report-Dataset-Id": str(dataset_id),
        },
    )


# ══════════════════════════════════════════════════════════════════════════════
# GET /report/datasets
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/datasets",
    summary="List Reportable Datasets",
    description=(
        "Returns all datasets that have at least one analysis run or benchmark result, "
        "along with their available data types (analysis, benchmark, complexity)."
    ),
)
def list_reportable_datasets(
    db: Session = Depends(get_db),
) -> dict:
    """
    Return dataset metadata for the report selection UI.
    Includes which report sections will be populated for each dataset.
    """
    datasets = db.query(Dataset).order_by(Dataset.id.desc()).all()

    # Count analysis and benchmark data per dataset
    analysis_ids = set(
        row[0] for row in
        db.query(AnalysisRun.dataset_id).distinct().all()
    )
    benchmark_ids = set(
        row[0] for row in
        db.query(BenchmarkResult.dataset_id).distinct().all()
    )
    # Datasets with 2+ distinct benchmark sizes → complexity analysis available
    from sqlalchemy import func
    complexity_ids = set(
        row[0]
        for row in db.query(
            BenchmarkResult.dataset_id,
            func.count(func.distinct(BenchmarkResult.dataset_size)).label("cnt")
        ).group_by(BenchmarkResult.dataset_id).having(
            func.count(func.distinct(BenchmarkResult.dataset_size)) >= 2
        ).all()
    )

    result = []
    for ds in datasets:
        has_analysis   = ds.id in analysis_ids
        has_benchmark  = ds.id in benchmark_ids
        has_complexity = ds.id in complexity_ids

        # Only include datasets with at least one section of data
        if not (has_analysis or has_benchmark):
            continue

        result.append({
            "id":              ds.id,
            "name":            ds.name,
            "size":            ds.size,
            "distribution_type": ds.distribution_type,
            "source":          ds.source,
            "min_price":       ds.min_price,
            "max_price":       ds.max_price,
            "created_at":      ds.created_at.isoformat() if ds.created_at else None,
            "has_analysis":    has_analysis,
            "has_benchmark":   has_benchmark,
            "has_complexity":  has_complexity,
            "report_url":      f"/api/v1/report/dataset/{ds.id}",
        })

    return {
        "total": len(result),
        "datasets": result,
    }
