"""
K-Means Market Regime Classifier — Phase 6.

Clusters rolling windows of the price series into distinct market regimes
(e.g., Bull / Bear / Sideways) using scikit-learn K-Means.

Academic context:
    K-Means minimizes within-cluster sum of squared Euclidean distances.
    Each window is represented by 4 features: mean return, volatility,
    trend slope, and return skewness. These 4 dimensions fully capture
    the first two moments of the return distribution plus directionality.

    Optimal K is validated using the Silhouette Score [-1, 1]:
        ≥ 0.5 → distinct, well-separated regimes
        < 0.3 → overlapping regimes (suggest different K)

    Regime labels are assigned post-hoc based on mean_return:
        Highest mean_return cluster  → "Bull Market"
        Lowest mean_return cluster   → "Bear Market"
        Middle cluster(s)            → "Sideways"

Complexity:
    Training:  O(N · K · I) — N=windows, K=clusters, I=iterations
    Inference: O(N · K)
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ml.base import (
    HyperparamDef, MLModelStrategy, ModelMetadata,
    PredictionResult, TrainingResult,
)
from ml.feature_engine import extract_window_features

try:
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import silhouette_score
    _SKLEARN_OK = True
except ImportError:
    _SKLEARN_OK = False

_HYPERPARAMS = [
    HyperparamDef(
        name="n_clusters", label="Number of Regimes (K)",
        type="int", default=3, min=2, max=5, step=1,
        description="2=Bull/Bear, 3=Bull/Sideways/Bear, 4–5=finer granularity",
    ),
    HyperparamDef(
        name="window_size", label="Window Size (bars)",
        type="int", default=50, min=20, max=200, step=10,
        description="Number of price points per rolling window",
    ),
    HyperparamDef(
        name="n_init", label="K-Means Re-starts",
        type="int", default=10, min=5, max=30, step=5,
        description="Number of random initializations (higher = more stable)",
    ),
]

_LABEL_MAP = {2: ["Bear Market", "Bull Market"],
              3: ["Bear Market", "Sideways", "Bull Market"],
              4: ["Strong Bear", "Bear", "Bull", "Strong Bull"],
              5: ["Crash", "Bear", "Sideways", "Bull", "Rally"]}

_REGIME_COLORS = {
    "Bear Market":   "#ef4444",
    "Strong Bear":   "#dc2626",
    "Crash":         "#7f1d1d",
    "Sideways":      "#f59e0b",
    "Bull Market":   "#10b981",
    "Strong Bull":   "#059669",
    "Rally":         "#34d399",
    "Bear":          "#f87171",
    "Bull":          "#6ee7b7",
}


class RegimeClassifier(MLModelStrategy):
    """K-Means market regime classifier."""

    def get_metadata(self) -> ModelMetadata:
        return ModelMetadata(
            name="regime_classifier",
            display_name="Market Regime Classifier",
            description=(
                "Clusters rolling price windows into distinct market regimes "
                "(Bull / Sideways / Bear) using K-Means clustering on "
                "return statistics and trend slope."
            ),
            algorithm="K-Means Clustering",
            library="scikit-learn",
            time_complexity="O(N · K · I)",
            use_case=(
                "Understand which phases of the price series correspond to "
                "trending, ranging, or declining markets. Guides algorithm "
                "selection: Kadane's is optimal in all regimes."
            ),
            hyperparams=_HYPERPARAMS,
            color="#f59e0b",
        )

    def train(self, prices: np.ndarray, hyperparams: dict) -> TrainingResult:
        if not _SKLEARN_OK:
            return TrainingResult(
                success=False, metrics={}, summary="", artifact=None,
                error="scikit-learn is not installed. Run: pip install scikit-learn",
            )
        try:
            k           = int(hyperparams.get("n_clusters",  3))
            window_size = int(hyperparams.get("window_size", 50))
            n_init      = int(hyperparams.get("n_init",      10))
            k           = max(2, min(k, 5))
            window_size = max(10, min(window_size, len(prices) // 5))

            # Extract window features
            X_win, midpoints = extract_window_features(prices, window_size)
            n_windows = len(X_win)

            if n_windows < k:
                return TrainingResult(
                    success=False, metrics={}, summary="", artifact=None,
                    error=f"Not enough windows ({n_windows}) for K={k}. "
                          f"Reduce window_size or use a larger dataset.",
                )

            scaler   = StandardScaler()
            X_scaled = scaler.fit_transform(X_win)

            kmeans = KMeans(n_clusters=k, n_init=n_init, random_state=42)
            cluster_ids = kmeans.fit_predict(X_scaled)

            # Silhouette score (needs k ≥ 2 and n_windows > k)
            sil = 0.0
            if n_windows > k:
                try:
                    sil = float(silhouette_score(X_scaled, cluster_ids))
                except Exception:
                    sil = 0.0

            # Assign semantic labels based on mean_return rank
            cluster_mean_returns = []
            for c in range(k):
                mask = cluster_ids == c
                mean_ret = float(X_win[mask, 0].mean()) if mask.any() else 0.0
                cluster_mean_returns.append((c, mean_ret))

            # Sort by mean_return ascending and assign semantic labels
            sorted_clusters = sorted(cluster_mean_returns, key=lambda x: x[1])
            labels_pool = _LABEL_MAP.get(k, [f"Regime {i}" for i in range(k)])
            label_for_cluster = {}
            for rank, (cid, _) in enumerate(sorted_clusters):
                label_for_cluster[cid] = labels_pool[rank]

            # Map windows to price points
            n_prices = len(prices)
            regime_per_point = _interpolate_regimes(
                cluster_ids, midpoints, n_prices, window_size
            )

            # Regime distribution
            named_labels = [label_for_cluster[c] for c in regime_per_point]
            distribution = {}
            for lbl in labels_pool:
                distribution[lbl] = round(named_labels.count(lbl) / n_prices, 4)

            # Downsampled for JSON storage
            ds_regimes = self._downsample_array(regime_per_point, 2000)
            ds_named   = [label_for_cluster[c] for c in ds_regimes]

            summary = (
                f"K-Means (K={k}) identified {k} market regimes across "
                f"{n_windows} windows (size={window_size}). "
                f"Silhouette score: {sil:.3f} "
                f"({'excellent' if sil >= 0.5 else 'good' if sil >= 0.3 else 'overlapping'}). "
                + "  ".join(f"{lbl}: {pct*100:.1f}%" for lbl, pct in distribution.items())
            )

            artifact = {
                "kmeans": kmeans, "scaler": scaler,
                "label_for_cluster": label_for_cluster,
                "window_size": window_size, "k": k,
            }
            metrics = {
                "k":             k,
                "n_windows":     n_windows,
                "silhouette":    round(sil, 4),
                "inertia":       round(float(kmeans.inertia_), 4),
                "distribution":  distribution,
                "n_init":        n_init,
                "window_size":   window_size,
            }
            sample = {
                "type":             "regime",
                "regimes":          ds_named,
                "regime_ids":       ds_regimes,
                "label_for_cluster": label_for_cluster,
                "distribution":     distribution,
                "regime_colors":    {lbl: _REGIME_COLORS.get(lbl, "#94a3b8") for lbl in labels_pool},
                "n_total":          n_prices,
                "k":                k,
            }

            return TrainingResult(
                success=True, metrics=metrics, summary=summary,
                artifact=artifact, sample_predictions=sample,
            )

        except Exception as exc:
            return TrainingResult(
                success=False, metrics={}, summary="", artifact=None, error=str(exc),
            )

    def predict(self, prices: np.ndarray, artifact: Any) -> PredictionResult:
        try:
            kmeans           = artifact["kmeans"]
            scaler           = artifact["scaler"]
            label_for_cluster = artifact["label_for_cluster"]
            window_size      = artifact["window_size"]

            X_win, midpoints = extract_window_features(prices, window_size)
            X_scaled         = scaler.transform(X_win)
            cluster_ids      = kmeans.predict(X_scaled)

            regime_per_point = _interpolate_regimes(
                cluster_ids, midpoints, len(prices), window_size
            )
            named = [label_for_cluster.get(c, "Unknown") for c in regime_per_point]
            ds    = self._downsample_array(named)
            dist  = {lbl: round(named.count(lbl) / len(prices), 4) for lbl in set(named)}

            return PredictionResult(
                model_name="regime_classifier",
                dataset_size=len(prices),
                predictions={"regimes": ds, "distribution": dist, "n_total": len(prices)},
                metrics={"n_windows": len(X_win)},
            )
        except Exception as exc:
            return PredictionResult(
                model_name="regime_classifier",
                dataset_size=len(prices),
                predictions={},
                metrics={"error": str(exc)},
            )


def _interpolate_regimes(
    cluster_ids: np.ndarray,
    midpoints:   np.ndarray,
    n_prices:    int,
    window_size: int,
) -> list[int]:
    """Map window-level cluster labels to per-point labels (nearest midpoint)."""
    regime_per_point = [0] * n_prices
    for i in range(n_prices):
        # Find nearest midpoint
        dists = np.abs(midpoints - i)
        nearest = int(np.argmin(dists))
        regime_per_point[i] = int(cluster_ids[nearest])
    return regime_per_point
