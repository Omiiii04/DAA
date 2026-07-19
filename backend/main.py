"""
FastAPI Application Entry Point.
Historic Stock Market Peak Analyzer — Backend API v1.

Run with:
    uvicorn main:app --reload --host 127.0.0.1 --port 8000

    (Use --host 0.0.0.0 only when LAN / container access is explicitly required.)

Swagger UI:  http://localhost:8000/api/v1/docs
ReDoc:       http://localhost:8000/api/v1/redoc
OpenAPI:     http://localhost:8000/api/v1/openapi.json
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.v1.routes import health
from api.v1.routes import datasets, analysis, benchmark, dashboard, complexity, report, ml
from config import settings
from database.init_db import init_database


# ══════════════════════════════════════════════════════════════════════════════
# Lifespan Handler
# ══════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan: runs startup logic before yield, shutdown after.

    Startup:
        - Initialize SQLite database (create tables if not exist).
        - Future: warm up ML model caches (Phase 6).

    Shutdown:
        - Future: flush background task queues, close connection pools.
    """
    # ── Startup ──────────────────────────────────────────────────────────────
    init_database()
    yield
    # ── Shutdown (Phase 6: cleanup hooks here) ────────────────────────────────


# ══════════════════════════════════════════════════════════════════════════════
# Application Factory
# ══════════════════════════════════════════════════════════════════════════════

def create_application() -> FastAPI:
    """
    Factory function for clean application instantiation.
    Separation from module-level `app` enables proper testing (no side effects).
    """
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "**Academic-grade web application** for comparative analysis of:\n\n"
            "| Algorithm | Complexity | Safe Dataset Limit |\n"
            "|---|---|---|\n"
            "| Brute Force | O(N²) | 20,000 |\n"
            "| Divide & Conquer | O(N log N) | 100,000 |\n"
            "| Kadane's Algorithm | O(N) | 1,000,000+ |\n\n"
            "All benchmarks run 10 iterations with Mean / Median / Min / Max / StdDev statistics."
        ),
        openapi_url=f"{settings.api_prefix}/openapi.json",
        docs_url=f"{settings.api_prefix}/docs",
        redoc_url=f"{settings.api_prefix}/redoc",
        lifespan=lifespan,
        contact={
            "name": "DAA Academic Project",
        },
        license_info={
            "name": "MIT",
        },
    )

    # ── CORS Middleware ───────────────────────────────────────────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )

    # ── Route Registration (versioned) ────────────────────────────────────────────
    application.include_router(health.router,    prefix=settings.api_prefix)
    application.include_router(datasets.router,  prefix=settings.api_prefix)
    application.include_router(analysis.router,  prefix=settings.api_prefix)
    application.include_router(benchmark.router,  prefix=settings.api_prefix)
    application.include_router(dashboard.router,   prefix=settings.api_prefix)
    application.include_router(complexity.router,  prefix=settings.api_prefix)
    application.include_router(report.router,      prefix=settings.api_prefix)
    application.include_router(ml.router,          prefix=settings.api_prefix)


    # ── Root Redirect ─────────────────────────────────────────────────────────
    @application.get("/", tags=["Root"], include_in_schema=False)
    async def root():
        return {
            "application": settings.app_name,
            "version": settings.app_version,
            "docs": f"{settings.api_prefix}/docs",
            "openapi_schema": f"{settings.api_prefix}/openapi.json",
            "health": f"{settings.api_prefix}/health",
        }

    return application


# ── Module-level app (used by uvicorn) ────────────────────────────────────────
app = create_application()
