"""
Isolation Forest Anomaly Detector — Phase 6.

Detects unusual price behavior (extreme z-scores, momentum spikes,
distribution tails) using scikit-learn's IsolationForest.

Academic context:
    IsolationForest (Liu et al., 2008) builds an ensemble of random trees.
    Anomalies are isolated in fewer splits — their average path length
    is shorter, producing a lower anomaly score.

    Score in [-1, 1]:
        ≈ -1 → anomaly (isolated quickly)
        ≈ +1 → normal  (requires many splits)

Features used (from feature_engine):
    [z_score, momentum_5, momentum_20, abs_return, bb_position]
    — chosen because they capture both price level and velocity anomalies.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Any

import numpy as np

from ml.base import (
    HyperparamDef, MLModelStrategy, ModelMetadata,
    PredictionResult, TrainingResult,
)
from ml.feature_engine import extract_point_features

try:
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    _SKLEARN_OK = True
except ImportError:
    _SKLEARN_OK = False


# ── Hyperparameter Definitions ─────────────────────────────────────────────────

_HYPERPARAMS = [
    HyperparamDef(
        name="contamination", label="Contamination Rate",
        type="float", default=0.05, min=0.01, max=0.20, step=0.01,
        description="Expected fraction of anomalies in the dataset (1%–20%)",
    ),
    HyperparamDef(
        name="n_estimators", label="Number of Trees",
        type="int", default=100, min=50, max=300, step=50,
        description="More trees → more stable scores but slower training",
    ),
    HyperparamDef(
        name="max_samples", label="Max Samples",
        type="select", default="auto", options=["auto", "256", "512", "1024"],
        description="Sub-sample size per tree (auto = min(256, N))",
    ),
]


class AnomalyDetector(MLModelStrategy):
    """Isolation Forest anomaly detector for price series."""

    def get_metadata(self) -> ModelMetadata:
        return ModelMetadata(
            name="anomaly_detector",
            display_name="Price Anomaly Detector",
            description=(
                "Identifies unusual price behavior using Isolation Forest — "
                "an unsupervised ensemble method that isolates anomalies "
                "faster than normal points in random binary trees."
            ),
            algorithm="Isolation Forest",
            library="scikit-learn",
            time_complexity="O(N · t · log(ψ))",
            use_case=(
                "Detect market crashes, data errors, flash crashes, "
                "and statistically extreme price movements."
            ),
            hyperparams=_HYPERPARAMS,
            color="#ef4444",
        )

    def train(self, prices: np.ndarray, hyperparams: dict) -> TrainingResult:
        if not _SKLEARN_OK:
            return TrainingResult(
                success=False, metrics={}, summary="", artifact=None,
                error="scikit-learn is not installed. Run: pip install scikit-learn",
            )

        try:
            contamination = float(hyperparams.get("contamination", 0.05))
            n_estimators  = int(hyperparams.get("n_estimators", 100))
            max_samples_raw = hyperparams.get("max_samples", "auto")
            max_samples   = int(max_samples_raw) if str(max_samples_raw).isdigit() else "auto"

            # Extract features
            X_full = extract_point_features(prices)
            # Use anomaly-relevant subset: z_score(4), mom5(5), mom20(6), abs_ret(9), bb_pos(8)
            X = X_full[:, [4, 5, 6, 9, 8]]

            # Scale
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)

            # Train
            clf = IsolationForest(
                n_estimators=n_estimators,
                contamination=contamination,
                max_samples=max_samples,
                random_state=42,
                n_jobs=-1,
            )
            labels = clf.fit_predict(X_scaled)    # -1 = anomaly, 1 = normal
            scores = clf.decision_function(X_scaled)  # [-1, 1]

            is_anomaly      = (labels == -1).astype(int)
            anomaly_indices = np.where(is_anomaly)[0].tolist()
            n_anomalies     = int(is_anomaly.sum())
            n               = len(prices)
            anomaly_rate    = n_anomalies / n

            # Cluster anomalies into contiguous regions
            regions = _find_regions(anomaly_indices)

            # Summary
            summary = (
                f"Isolation Forest detected {n_anomalies:,} anomalous points "
                f"({anomaly_rate*100:.2f}% of N={n:,}) using "
                f"{n_estimators} trees. "
                f"Score range: [{scores.min():.3f}, {scores.max():.3f}]. "
                f"Anomalies cluster into {len(regions)} region(s)."
            )

            # Downsample scores and labels for storage
            ds_scores  = self._downsample_array(scores.tolist())
            ds_anomaly = self._downsample_array(is_anomaly.tolist())

            artifact = {"clf": clf, "scaler": scaler, "feature_cols": [4, 5, 6, 9, 8]}
            metrics  = {
                "n_anomalies":   n_anomalies,
                "anomaly_rate":  round(anomaly_rate, 5),
                "n_regions":     len(regions),
                "score_min":     round(float(scores.min()), 4),
                "score_max":     round(float(scores.max()), 4),
                "score_mean":    round(float(scores.mean()), 4),
                "contamination": contamination,
                "n_estimators":  n_estimators,
            }

            sample = {
                "type":            "anomaly",
                "anomaly_indices": anomaly_indices[:500],   # Top 500 for chart
                "scores":          ds_scores,
                "is_anomaly":      ds_anomaly,
                "regions":         regions[:50],            # Top 50 regions
                "n_total":         n,
            }

            return TrainingResult(
                success=True, metrics=metrics, summary=summary,
                artifact=artifact, sample_predictions=sample,
            )

        except Exception as exc:
            return TrainingResult(
                success=False, metrics={}, summary="", artifact=None,
                error=str(exc),
            )

    def predict(self, prices: np.ndarray, artifact: Any) -> PredictionResult:
        try:
            clf         = artifact["clf"]
            scaler      = artifact["scaler"]
            feat_cols   = artifact["feature_cols"]

            X_full  = extract_point_features(prices)
            X       = X_full[:, feat_cols]
            X_sc    = scaler.transform(X)
            labels  = clf.predict(X_sc)
            scores  = clf.decision_function(X_sc)

            is_anomaly = (labels == -1).astype(int)
            anomaly_idx = np.where(is_anomaly)[0].tolist()

            return PredictionResult(
                model_name="anomaly_detector",
                dataset_size=len(prices),
                predictions={
                    "anomaly_indices": anomaly_idx[:500],
                    "scores":          self._downsample_array(scores.tolist()),
                    "is_anomaly":      self._downsample_array(is_anomaly.tolist()),
                    "n_anomalies":     int(is_anomaly.sum()),
                    "n_total":         len(prices),
                },
                metrics={"anomaly_rate": float(is_anomaly.mean())},
            )
        except Exception as exc:
            return PredictionResult(
                model_name="anomaly_detector",
                dataset_size=len(prices),
                predictions={},
                metrics={"error": str(exc)},
            )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _find_regions(indices: list[int], gap: int = 5) -> list[dict]:
    """Merge consecutive anomaly indices into contiguous regions."""
    if not indices:
        return []
    regions, start, end = [], indices[0], indices[0]
    for i in range(1, len(indices)):
        if indices[i] - end <= gap:
            end = indices[i]
        else:
            regions.append({"start": start, "end": end, "length": end - start + 1})
            start = end = indices[i]
    regions.append({"start": start, "end": end, "length": end - start + 1})
    return regions
