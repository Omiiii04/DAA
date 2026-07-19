"""
ML Routes — Phase 6.

Endpoints:
    GET  /ml/models                    — List all registered ML models + hyperparams
    POST /ml/train                     — Start a training job (background task)
    GET  /ml/job/{job_id}              — Poll job status + results
    GET  /ml/jobs                      — List all training jobs
    POST /ml/predict/{job_id}          — Run inference on a dataset using trained model
    DELETE /ml/job/{job_id}            — Delete job and artifact from disk

Training flow:
    1. Client POSTs /ml/train with {dataset_id, model_name, hyperparams}
    2. Route loads prices from .npy file (or generates if sweep dataset)
    3. asyncio.to_thread() dispatches ml_trainer.run_train_sync()
    4. Client polls GET /ml/job/{id} every 2s
    5. On completion, job.sample contains downsampled predictions for visualization
"""

import asyncio
import json
import logging
import os
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

import numpy as np

from database.connection import get_db
from database.models import Dataset, MLTrainingJob
from ml.registry import list_model_metadata, get_model
from services.ml_trainer import ml_trainer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ml", tags=["ML Hooks"])


# ══════════════════════════════════════════════════════════════════════════════
# Request Schemas
# ══════════════════════════════════════════════════════════════════════════════

class TrainRequest(BaseModel):
    dataset_id:  int
    model_name:  str
    hyperparams: dict = Field(default_factory=dict)

    @field_validator("model_name")
    @classmethod
    def validate_model(cls, v: str) -> str:
        from ml.registry import ML_MODEL_REGISTRY
        if v not in ML_MODEL_REGISTRY:
            raise ValueError(
                f"Unknown model '{v}'. "
                f"Registered: {sorted(ML_MODEL_REGISTRY.keys())}"
            )
        return v


class PredictRequest(BaseModel):
    dataset_id: int


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _load_prices(dataset: Dataset, db: Session) -> np.ndarray:
    """Load prices from .npy file or raise HTTPException."""
    if not dataset.file_path or not os.path.isfile(dataset.file_path):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Dataset #{dataset.id} has no price file on disk. "
                "Sweep datasets generated without a .npy file cannot be used "
                "for ML training directly. Please use a regular dataset."
            ),
        )
    return np.load(dataset.file_path)


# ══════════════════════════════════════════════════════════════════════════════
# GET /ml/models
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/models",
    summary="List ML Models",
    description="Returns metadata (name, description, hyperparams) for all registered ML models.",
)
def list_models() -> dict:
    """Return all registered ML models with their metadata."""
    return {
        "models": list_model_metadata(),
        "total":  len(list_model_metadata()),
    }


# ══════════════════════════════════════════════════════════════════════════════
# POST /ml/train
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/train",
    status_code=202,
    summary="Start ML Training Job",
    description=(
        "Launches an ML training job in a background thread. "
        "Returns a job_id immediately. Poll GET /ml/job/{job_id} for status."
    ),
)
async def start_training(
    request:          TrainRequest,
    background_tasks: BackgroundTasks,
    db:               Session = Depends(get_db),
) -> dict:
    """Start an ML model training job."""
    # Validate dataset
    dataset = db.query(Dataset).filter(Dataset.id == request.dataset_id).first()
    if dataset is None:
        raise HTTPException(status_code=404, detail=f"Dataset #{request.dataset_id} not found.")

    # Validate file access early (before job creation)
    if not dataset.file_path or not os.path.isfile(dataset.file_path):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Dataset #{request.dataset_id} ('{dataset.name}') has no .npy price file. "
                "Use a dataset generated or uploaded through the Datasets page."
            ),
        )

    # Merge default hyperparams with user overrides
    strategy   = get_model(request.model_name)
    meta       = strategy.get_metadata()
    hp_merged  = {hp.name: hp.default for hp in meta.hyperparams}
    hp_merged.update(request.hyperparams)

    # Clamp every hyperparam to its declared [min, max] range.
    # Any value that is out-of-range or non-numeric is reset to the default.
    for hp_def in meta.hyperparams:
        raw = hp_merged.get(hp_def.name, hp_def.default)
        if hp_def.min is not None or hp_def.max is not None:
            try:
                v = float(raw)
                if hp_def.min is not None:
                    v = max(float(hp_def.min), v)
                if hp_def.max is not None:
                    v = min(float(hp_def.max), v)
                # Preserve int type for integer hyperparams
                hp_merged[hp_def.name] = int(v) if hp_def.type == "int" else v
            except (TypeError, ValueError):
                logger.warning(
                    "Hyperparam '%s' received invalid value %r; using default %r",
                    hp_def.name, raw, hp_def.default,
                )
                hp_merged[hp_def.name] = hp_def.default

    # Create DB record
    job_id = await ml_trainer.create_job(
        model_name=request.model_name,
        dataset_id=request.dataset_id,
        hyperparams=hp_merged,
        db=db,
    )

    # Load prices now (in the async context) then pass ndarray to thread
    prices = np.load(dataset.file_path)

    # Dispatch training to thread
    background_tasks.add_task(
        asyncio.to_thread,
        ml_trainer.run_train_sync,
        job_id,
        prices,
        request.model_name,
        hp_merged,
    )

    logger.info("ML training job %d started: model=%s dataset=%d N=%d",
                job_id, request.model_name, request.dataset_id, len(prices))

    return {
        "job_id":     job_id,
        "model_name": request.model_name,
        "dataset_id": request.dataset_id,
        "dataset_n":  int(len(prices)),
        "status":     "queued",
        "poll_url":   f"/api/v1/ml/job/{job_id}",
        "message":    f"Training job #{job_id} queued. Poll {'/api/v1/ml/job/' + str(job_id)} for updates.",
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET /ml/job/{job_id}
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/job/{job_id}",
    summary="Get ML Job Status",
    description="Returns current status, metrics, summary, and sample predictions for a training job.",
)
async def get_job(job_id: int, db: Session = Depends(get_db)) -> dict:
    """Poll one ML training job."""
    job = await ml_trainer.get_job(job_id, db)
    if job is None:
        raise HTTPException(status_code=404, detail=f"ML job #{job_id} not found.")
    return job


# ══════════════════════════════════════════════════════════════════════════════
# GET /ml/jobs
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/jobs",
    summary="List All ML Jobs",
    description="Returns all ML training jobs, newest first.",
)
async def list_jobs(
    limit: int = Query(50, ge=1, le=200, description="Max number of jobs to return (1–200)"),
    db: Session = Depends(get_db),
) -> dict:
    """List all ML training jobs (newest first, max 200)."""
    jobs = await ml_trainer.list_jobs(db, limit=limit)
    return {"total": len(jobs), "jobs": jobs}


# ══════════════════════════════════════════════════════════════════════════════
# POST /ml/predict/{job_id}
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/predict/{job_id}",
    summary="Run Inference with Trained Model",
    description=(
        "Loads a trained artifact and runs inference on the specified dataset. "
        "Returns downsampled predictions suitable for visualization."
    ),
)
def run_predict(
    job_id:  int,
    request: PredictRequest,
    db:      Session = Depends(get_db),
) -> dict:
    """Run inference on a new dataset using a previously trained model."""
    dataset = db.query(Dataset).filter(Dataset.id == request.dataset_id).first()
    if dataset is None:
        raise HTTPException(status_code=404, detail=f"Dataset #{request.dataset_id} not found.")

    prices = _load_prices(dataset, db)

    try:
        result = ml_trainer.run_predict_sync(job_id, prices, db)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════════════════════
# DELETE /ml/job/{job_id}
# ══════════════════════════════════════════════════════════════════════════════

@router.delete(
    "/job/{job_id}",
    status_code=200,
    summary="Delete ML Job",
    description="Deletes the training job record and its artifact file from disk.",
)
def delete_job(job_id: int, db: Session = Depends(get_db)) -> dict:
    """Delete a training job and its artifact."""
    row = db.query(MLTrainingJob).filter(MLTrainingJob.id == job_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"ML job #{job_id} not found.")

    # Remove artifact file
    artifact_deleted = False
    if row.model_path and os.path.isfile(row.model_path):
        try:
            os.remove(row.model_path)
            artifact_deleted = True
        except OSError as e:
            logger.warning("Could not delete artifact %s: %s", row.model_path, e)

    db.delete(row)
    db.commit()

    return {
        "deleted":          job_id,
        "artifact_deleted": artifact_deleted,
        "message":          f"ML job #{job_id} and its artifact have been deleted.",
    }
