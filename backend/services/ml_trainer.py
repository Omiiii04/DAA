"""
ML Trainer Service — Phase 6.

Manages the lifecycle of ML training jobs:
    create_job()       → allocates an MLTrainingJob DB row
    get_job()          → fetches current state
    list_jobs()        → all jobs (newest first)
    run_train_sync()   → executes training in a thread

Architecture mirrors Phase 2 BenchmarkRunner + Phase 4 SweepService:
    - asyncio.Lock protects the in-memory job status cache
    - Heavy training runs in asyncio.to_thread() (never blocking the event loop)
    - Artifacts are persisted with joblib to data/ml_models/

Job Lifecycle:
    QUEUED → RUNNING → COMPLETED | FAILED
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np

from config import settings
from ml.registry import get_model

logger = logging.getLogger(__name__)

# ── Artifact directory ─────────────────────────────────────────────────────────
_MODELS_DIR = settings.data_dir / "ml_models"
_MODELS_DIR.mkdir(parents=True, exist_ok=True)

try:
    import joblib
    _JOBLIB_OK = True
except ImportError:
    _JOBLIB_OK = False

_TERMINAL = {"completed", "failed"}


# ══════════════════════════════════════════════════════════════════════════════
# Trainer
# ══════════════════════════════════════════════════════════════════════════════

class MLTrainer:
    """
    Singleton service orchestrating ML training jobs.

    Creates MLTrainingJob rows in the DB, dispatches training to a
    thread-pool via asyncio.to_thread(), and persists artifacts.
    """

    def __init__(self) -> None:
        # NOTE: asyncio.Lock() must be created inside a running event loop
        # (Python 3.10+). We initialise lazily via _get_lock() so the lock
        # is always bound to the correct loop — important for test suites
        # that create a fresh event loop per test.
        self._lock: asyncio.Lock | None = None

    def _get_lock(self) -> asyncio.Lock:
        """Return the async lock, creating it in the current loop if needed."""
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    # ── Public Async API ───────────────────────────────────────────────────────

    async def create_job(
        self,
        model_name:  str,
        dataset_id:  Optional[int],
        hyperparams: dict,
        db,
    ) -> int:
        """
        Persist a new MLTrainingJob row and return its integer ID.

        Args:
            model_name:  ML_MODEL_REGISTRY key.
            dataset_id:  Dataset to train on (None = will be set later).
            hyperparams: User-supplied hyperparameter overrides.
            db:          SQLAlchemy session (request-scoped).
        """
        from database.models import MLTrainingJob

        job = MLTrainingJob(
            model_name=model_name,
            dataset_id=dataset_id,
            status="queued",
            hyperparams=json.dumps(hyperparams),
            created_at=datetime.utcnow(),
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return int(job.id)

    async def get_job(self, job_id: int, db) -> Optional[dict]:
        """Fetch a job by ID as a dict (returns None if not found)."""
        from database.models import MLTrainingJob

        row = db.query(MLTrainingJob).filter(MLTrainingJob.id == job_id).first()
        return self._row_to_dict(row) if row else None

    async def list_jobs(self, db, limit: int = 50) -> list[dict]:
        """Return up to `limit` jobs ordered newest first."""
        from database.models import MLTrainingJob

        rows = (
            db.query(MLTrainingJob)
            .order_by(MLTrainingJob.id.desc())
            .limit(limit)
            .all()
        )
        return [self._row_to_dict(r) for r in rows]

    # ── Synchronous Training (call via asyncio.to_thread) ─────────────────────

    def run_train_sync(
        self,
        job_id:     int,
        prices:     np.ndarray,
        model_name: str,
        hyperparams: dict,
    ) -> None:
        """
        Execute model training synchronously.

        MUST be called via asyncio.to_thread() — not from an async context.
        Opens its own DB session (background-task-safe pattern).
        """
        from database.connection import SessionLocal
        from database.models import MLTrainingJob

        db = SessionLocal()
        try:
            row = db.query(MLTrainingJob).filter(MLTrainingJob.id == job_id).first()
            if row is None:
                logger.error("[ML] Job %d not found", job_id)
                return

            row.status = "running"
            db.commit()

            logger.info("[ML] Training '%s' (job %d, N=%d)", model_name, job_id, len(prices))

            # ── Train ─────────────────────────────────────────────────────────
            strategy = get_model(model_name)
            result   = strategy.train(prices, hyperparams)

            if not result.success:
                row.status        = "failed"
                row.error_message = result.error
                row.completed_at  = datetime.utcnow()
                db.commit()
                logger.warning("[ML] Job %d failed: %s", job_id, result.error)
                return

            # ── Persist artifact ──────────────────────────────────────────────
            model_path = None
            if _JOBLIB_OK and result.artifact is not None:
                artifact_file = _MODELS_DIR / f"ml_job_{job_id}.pkl"
                joblib.dump(result.artifact, artifact_file)
                model_path = str(artifact_file)
                logger.info("[ML] Artifact saved: %s", artifact_file)

            # ── Update DB row ─────────────────────────────────────────────────
            row.status       = "completed"
            row.metrics      = json.dumps(result.metrics)
            row.summary      = result.summary
            row.sample_json  = json.dumps(result.sample_predictions)
            row.model_path   = model_path
            row.completed_at = datetime.utcnow()
            db.commit()

            logger.info("[ML] Job %d completed successfully.", job_id)

        except Exception as exc:
            logger.error("[ML] Fatal error in job %d: %s", job_id, exc, exc_info=True)
            try:
                row = db.query(MLTrainingJob).filter(MLTrainingJob.id == job_id).first()
                if row:
                    row.status        = "failed"
                    row.error_message = str(exc)
                    row.completed_at  = datetime.utcnow()
                    db.commit()
            except Exception:
                db.rollback()
        finally:
            db.close()

    # ── Inference (synchronous, for predict endpoint) ─────────────────────────

    @staticmethod
    def run_predict_sync(job_id: int, prices: np.ndarray, db) -> dict:
        """
        Load a trained artifact from disk and run inference on `prices`.
        Returns a dict with prediction data.
        """
        from database.models import MLTrainingJob

        row = db.query(MLTrainingJob).filter(MLTrainingJob.id == job_id).first()
        if row is None:
            raise ValueError(f"ML job #{job_id} not found.")
        if row.status != "completed":
            raise ValueError(f"ML job #{job_id} is not completed (status={row.status}).")
        if not row.model_path or not os.path.isfile(row.model_path):
            raise ValueError(f"ML job #{job_id} artifact not found on disk.")
        if not _JOBLIB_OK:
            raise RuntimeError("joblib is not installed. Cannot load artifact.")

        # ── Path-traversal guard ──────────────────────────────────────────────
        # Confirm the stored path resolves to a file inside _MODELS_DIR.
        # A tampered DB row could otherwise cause joblib (pickle) to load an
        # arbitrary file from anywhere on the filesystem.
        artifact_path = Path(row.model_path).resolve()
        allowed_dir   = _MODELS_DIR.resolve()
        if not str(artifact_path).startswith(str(allowed_dir) + os.sep) and \
                artifact_path != allowed_dir:
            raise ValueError(
                f"ML job #{job_id} artifact path is outside the models "
                f"directory and will not be loaded."
            )

        artifact = joblib.load(artifact_path)
        strategy = get_model(row.model_name)
        result   = strategy.predict(prices, artifact)
        return {
            "job_id":      job_id,
            "model_name":  row.model_name,
            "predictions": result.predictions,
            "metrics":     result.metrics,
        }

    # ── Serialization ──────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_dict(row) -> dict:
        def _load_json(s):
            if s is None:
                return {}
            try:
                return json.loads(s)
            except Exception:
                return {}

        return {
            "id":           row.id,
            "model_name":   row.model_name,
            "dataset_id":   row.dataset_id,
            "status":       row.status,
            "hyperparams":  _load_json(row.hyperparams),
            "metrics":      _load_json(row.metrics),
            "summary":      row.summary or "",
            "sample":       _load_json(row.sample_json),
            "model_path":   row.model_path,
            "error":        row.error_message,
            "created_at":   row.created_at.isoformat() if row.created_at else None,
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        }


# ── Singleton ─────────────────────────────────────────────────────────────────
ml_trainer = MLTrainer()
