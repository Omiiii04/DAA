"""
ML Model Strategy — Abstract Base & Shared Dataclasses.

All Phase 6 ML models implement MLModelStrategy and produce
TrainingResult / PredictionResult objects.

Design Principles:
    - Strategy Pattern: swap models without changing training infrastructure
    - Stateless strategies: all state lives in the returned artifact
    - Serializable artifacts: must be joblib-serializable (sklearn estimators)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np


# ══════════════════════════════════════════════════════════════════════════════
# Metadata
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class HyperparamDef:
    """Definition of a single hyperparameter for UI rendering."""
    name:        str
    label:       str
    type:        str           # "int" | "float" | "select"
    default:     Any
    min:         Optional[Any] = None
    max:         Optional[Any] = None
    step:        Optional[Any] = None
    options:     Optional[list] = None   # For "select" type
    description: str = ""


@dataclass
class ModelMetadata:
    """Static description of an ML model — shown in the selection UI."""
    name:         str            # Registry key
    display_name: str            # Human-readable
    description:  str
    algorithm:    str            # e.g., "Isolation Forest"
    library:      str            # e.g., "scikit-learn"
    time_complexity: str         # Training complexity
    use_case:     str
    hyperparams:  list[HyperparamDef]
    color:        str            # Hex, for UI accent


# ══════════════════════════════════════════════════════════════════════════════
# Training & Prediction Results
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class TrainingResult:
    """
    Result of one training run.

    sample_predictions:
        Downsampled to ≤ 2000 points for efficient JSON storage.
        Keys depend on model type (see per-model docstrings).
    """
    success:              bool
    metrics:              dict             # Model-specific KPIs
    summary:              str              # Human-readable interpretation
    artifact:             Any              # Serializable sklearn estimator bundle
    sample_predictions:   dict = field(default_factory=dict)
    error:                Optional[str] = None


@dataclass
class PredictionResult:
    """
    Result of running inference on a (possibly different) dataset.
    """
    model_name:   str
    dataset_size: int
    predictions:  dict          # Downsampled predictions
    metrics:      dict = field(default_factory=dict)


# ══════════════════════════════════════════════════════════════════════════════
# Abstract Strategy
# ══════════════════════════════════════════════════════════════════════════════

class MLModelStrategy(ABC):
    """
    Abstract base for all ML model strategies.

    Subclasses must be stateless: all learned parameters live
    in the artifact returned by train().
    """

    @abstractmethod
    def get_metadata(self) -> ModelMetadata:
        """Return static model metadata (name, description, hyperparams)."""
        ...

    @abstractmethod
    def train(
        self,
        prices: np.ndarray,
        hyperparams: dict,
    ) -> TrainingResult:
        """
        Train the model on the given price series.

        Args:
            prices:     Raw price array (float64, shape [N]).
            hyperparams: Dict of user-supplied parameter overrides.

        Returns:
            TrainingResult with metrics, summary, artifact, and sample predictions.
        """
        ...

    @abstractmethod
    def predict(
        self,
        prices: np.ndarray,
        artifact: Any,
    ) -> PredictionResult:
        """
        Run inference on a new price series using a trained artifact.

        Args:
            prices:   Raw price array (float64).
            artifact: The artifact returned by a previous train() call.

        Returns:
            PredictionResult with downsampled predictions.
        """
        ...

    # ── Shared Utilities ───────────────────────────────────────────────────────

    @staticmethod
    def _downsample_array(arr: list, target: int = 2000) -> list:
        """Uniformly downsample a list to at most `target` elements."""
        n = len(arr)
        if n <= target:
            return arr
        step = n / target
        indices = [int(i * step) for i in range(target)]
        return [arr[i] for i in indices]

    @staticmethod
    def _safe_float(v) -> float:
        """Convert to float, replacing NaN/Inf with 0."""
        try:
            f = float(v)
            return f if (f == f and abs(f) != float("inf")) else 0.0
        except Exception:
            return 0.0
