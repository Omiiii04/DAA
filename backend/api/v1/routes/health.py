"""
Health Check Routes — /api/v1/health

Two endpoints for monitoring and debugging:

    GET /api/v1/health
        Liveness probe — no database dependency.
        Returns 200 if the FastAPI process is running.
        Used by Docker HEALTHCHECK and uptime monitors.

    GET /api/v1/health/full
        Readiness probe — validates database connectivity.
        Returns 200 if healthy, 503 if database is unreachable.
        Used by load balancers before routing traffic.

Both endpoints expose the algorithm registry and complexity map —
useful for frontend developers to confirm which algorithms are available
before making POST /analyze or POST /benchmark requests.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from algorithms.registry import ALGORITHM_REGISTRY
from config import settings
from database.connection import get_db
from models.schemas import HealthSchema

router = APIRouter(prefix="/health", tags=["Health & Status"])


@router.get(
    "",
    response_model=HealthSchema,
    summary="Liveness Probe",
    description=(
        "Lightweight liveness check — no database query. "
        "Returns 200 OK if the FastAPI process is running. "
        "Also exposes the algorithm registry for frontend enumeration."
    ),
)
async def health_liveness() -> HealthSchema:
    """
    Liveness probe: verifies only that the process is alive.
    Does NOT test database connectivity (use /health/full for that).
    """
    return HealthSchema(
        status="healthy",
        app=settings.app_name,
        version=settings.app_version,
        database="not_checked",
        registered_algorithms=ALGORITHM_REGISTRY.names(),
        algorithm_complexities=ALGORITHM_REGISTRY.complexities(),
        timestamp=datetime.utcnow(),
    )


@router.get(
    "/full",
    response_model=HealthSchema,
    summary="Readiness Probe",
    description=(
        "Full readiness check including database connectivity test. "
        "Returns 200 if healthy, 503 if the database is unreachable. "
        "Also validates that the algorithm registry is populated."
    ),
)
async def health_readiness(
    response: Response,
    db: Session = Depends(get_db),
) -> HealthSchema:
    """
    Readiness probe: validates process + database + algorithm registry.

    Sets HTTP 503 Service Unavailable if any check fails, enabling
    upstream load balancers to stop routing traffic to this instance.
    """
    db_status = "unknown"
    overall_status = "healthy"

    # ── Database connectivity check ───────────────────────────────────────────
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as exc:
        db_status = f"error: {exc}"
        overall_status = "degraded"

    # ── Algorithm registry check ──────────────────────────────────────────────
    if not ALGORITHM_REGISTRY.names():
        overall_status = "degraded"
        db_status = db_status + " | registry_empty"

    # ── Set response code ─────────────────────────────────────────────────────
    if overall_status != "healthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return HealthSchema(
        status=overall_status,
        app=settings.app_name,
        version=settings.app_version,
        database=db_status,
        registered_algorithms=ALGORITHM_REGISTRY.names(),
        algorithm_complexities=ALGORITHM_REGISTRY.complexities(),
        timestamp=datetime.utcnow(),
    )
