"""
ML Model Registry — Phase 6.

All three Phase 6 models are registered here.  The registry is the
single source of truth consumed by MLTrainer and the /ml routes.

Pattern mirrors ALGORITHM_REGISTRY from Phase 2 for architectural consistency.
"""

from ml.anomaly import AnomalyDetector
from ml.regime  import RegimeClassifier
from ml.predictor import PeakPredictor
from ml.base import MLModelStrategy

# ── Registry ──────────────────────────────────────────────────────────────────
ML_MODEL_REGISTRY: dict[str, MLModelStrategy] = {
    "anomaly_detector":  AnomalyDetector(),
    "regime_classifier": RegimeClassifier(),
    "peak_predictor":    PeakPredictor(),
}


def get_model(name: str) -> MLModelStrategy:
    """
    Retrieve a registered ML model by name.

    Raises:
        KeyError: If the model name is not registered.
    """
    model = ML_MODEL_REGISTRY.get(name)
    if model is None:
        raise KeyError(
            f"Unknown ML model '{name}'. "
            f"Registered: {sorted(ML_MODEL_REGISTRY.keys())}"
        )
    return model


def list_model_metadata() -> list[dict]:
    """Return serializable metadata for all registered models."""
    result = []
    for key, model in ML_MODEL_REGISTRY.items():
        m = model.get_metadata()
        result.append({
            "name":           m.name,
            "display_name":   m.display_name,
            "description":    m.description,
            "algorithm":      m.algorithm,
            "library":        m.library,
            "time_complexity": m.time_complexity,
            "use_case":       m.use_case,
            "color":          m.color,
            "hyperparams": [
                {
                    "name":        hp.name,
                    "label":       hp.label,
                    "type":        hp.type,
                    "default":     hp.default,
                    "min":         hp.min,
                    "max":         hp.max,
                    "step":        hp.step,
                    "options":     hp.options,
                    "description": hp.description,
                }
                for hp in m.hyperparams
            ],
        })
    return result
