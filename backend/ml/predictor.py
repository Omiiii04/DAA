"""
Gradient Boosting Buy/Sell Signal Predictor — Phase 6.

Predicts optimal trading signals (Buy / Hold / Sell) using a
Gradient Boosting Classifier trained on pseudo-labels derived from
Kadane's Algorithm (the provably optimal buy/sell solution).

Academic framing:
    This is a supervised learning approach where the "ground truth" labels
    are generated from the Maximum Subarray Problem solution — an instance
    of Algorithm-Guided Machine Learning. The model learns FEATURES of
    price series that correlate with optimal entry/exit points.

    Pseudo-label Generation:
        buy_zone  = [buy_idx - δ, buy_idx + δ]   → label 1 (Buy)
        sell_zone = [sell_idx - δ, sell_idx + δ]  → label 2 (Sell)
        elsewhere → label 0 (Hold)
        where δ = max(N//100, 10)  (5% neighborhood)

    Features: RSI-14, Bollinger position, momentum-5, momentum-20,
              z-score, absolute return, price trend slope.

    Gradient Boosting Classifier (Friedman, 2001):
        Builds an additive model of CART decision stumps.
        Each tree corrects the residuals of the previous ensemble.
        T(n) = O(N · M · D) where M=n_estimators, D=max_depth.

    Metrics reported:
        Training accuracy (on pseudo-labels)
        Feature importances (which features drive predictions)
        Predicted buy/sell signal counts and confidence distribution
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ml.base import (
    HyperparamDef, MLModelStrategy, ModelMetadata,
    PredictionResult, TrainingResult,
)
from ml.feature_engine import extract_point_features

try:
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.preprocessing import StandardScaler
    _SKLEARN_OK = True
except ImportError:
    _SKLEARN_OK = False

_HYPERPARAMS = [
    HyperparamDef(
        name="n_estimators", label="Number of Boosting Rounds",
        type="int", default=100, min=50, max=500, step=50,
        description="More rounds → higher accuracy but slower training",
    ),
    HyperparamDef(
        name="learning_rate", label="Learning Rate",
        type="float", default=0.1, min=0.01, max=0.5, step=0.01,
        description="Shrinkage factor per boosting step (smaller = more robust)",
    ),
    HyperparamDef(
        name="max_depth", label="Max Tree Depth",
        type="int", default=3, min=2, max=6, step=1,
        description="Depth of each decision tree (3 is typically optimal)",
    ),
    HyperparamDef(
        name="zone_pct", label="Signal Zone Width (%)",
        type="float", default=5.0, min=1.0, max=15.0, step=0.5,
        description="% of N used as neighborhood around optimal buy/sell points",
    ),
]

# Feature column indices from extract_point_features
_FEATURE_NAMES = ["price", "return", "rolling_mean", "rolling_std",
                  "z_score", "mom5", "mom20", "rsi14", "bb_pos", "abs_return"]
_PRED_FEATURE_COLS = [4, 5, 6, 7, 8, 9]   # z_score, mom5, mom20, rsi14, bb_pos, abs_return
_PRED_FEATURE_NAMES = ["z_score", "mom5", "mom20", "rsi14", "bb_pos", "abs_return"]


class PeakPredictor(MLModelStrategy):
    """Gradient Boosting buy/sell signal predictor."""

    def get_metadata(self) -> ModelMetadata:
        return ModelMetadata(
            name="peak_predictor",
            display_name="Buy/Sell Signal Predictor",
            description=(
                "Trains a Gradient Boosting Classifier using pseudo-labels "
                "derived from Kadane's optimal solution. Predicts Buy/Hold/Sell "
                "signals and their confidence across the price series."
            ),
            algorithm="Gradient Boosting (CART stumps)",
            library="scikit-learn",
            time_complexity="O(N · M · D)",
            use_case=(
                "Identify price regions with features similar to historically "
                "optimal entry/exit points. Validates ML predictions against "
                "the provably correct algorithmic solution."
            ),
            hyperparams=_HYPERPARAMS,
            color="#10b981",
        )

    def train(self, prices: np.ndarray, hyperparams: dict) -> TrainingResult:
        if not _SKLEARN_OK:
            return TrainingResult(
                success=False, metrics={}, summary="", artifact=None,
                error="scikit-learn is not installed. Run: pip install scikit-learn",
            )
        try:
            n_est        = int(hyperparams.get("n_estimators",  100))
            lr           = float(hyperparams.get("learning_rate", 0.1))
            max_depth    = int(hyperparams.get("max_depth",       3))
            zone_pct     = float(hyperparams.get("zone_pct",       5.0))

            n = len(prices)

            # ── Compute pseudo-labels from daily changes ─────────────────────
            changes = np.diff(prices)
            changes = np.concatenate([[0.0], changes])

            # Maximum subarray (Kadane's) on changes
            buy_idx, sell_idx = _kadane_indices(changes)
            delta = max(int(n * zone_pct / 100), 10)

            y = np.zeros(n, dtype=int)   # 0 = Hold
            y[max(0, buy_idx  - delta): buy_idx  + delta + 1] = 1   # Buy
            y[max(0, sell_idx - delta): sell_idx + delta + 1] = 2   # Sell

            # Remove overlap: sell overrides buy at overlap (sell_idx > buy_idx)
            if sell_idx > buy_idx:
                y[max(0, buy_idx - delta): min(buy_idx + delta + 1, sell_idx)] = \
                    np.where(y[max(0, buy_idx - delta): min(buy_idx + delta + 1, sell_idx)] == 2,
                             2, 1)

            # ── Extract features ──────────────────────────────────────────────
            X_full = extract_point_features(prices)
            X = X_full[:, _PRED_FEATURE_COLS]

            scaler = StandardScaler()
            X_sc   = scaler.fit_transform(X)

            # ── Train ─────────────────────────────────────────────────────────
            clf = GradientBoostingClassifier(
                n_estimators=n_est,
                learning_rate=lr,
                max_depth=max_depth,
                random_state=42,
                subsample=0.8,
            )
            clf.fit(X_sc, y)

            # ── Predict all points ────────────────────────────────────────────
            preds    = clf.predict(X_sc).tolist()
            probas   = clf.predict_proba(X_sc)
            conf     = probas.max(axis=1).tolist()

            acc     = float(np.mean(np.array(preds) == y))
            buy_ct  = preds.count(1)
            sell_ct = preds.count(2)
            hold_ct = preds.count(0)

            # Feature importances
            fi = dict(zip(
                _PRED_FEATURE_NAMES,
                [round(float(v), 4) for v in clf.feature_importances_]
            ))
            top_feat = max(fi, key=fi.get)

            # Confidence percentiles
            conf_arr  = np.array(conf)
            conf_p50  = round(float(np.percentile(conf_arr, 50)), 4)
            conf_p90  = round(float(np.percentile(conf_arr, 90)), 4)

            summary = (
                f"GradientBoosting trained on N={n:,} points "
                f"({n_est} estimators, lr={lr}, depth={max_depth}). "
                f"Training accuracy: {acc*100:.1f}%. "
                f"Signals — Buy: {buy_ct:,}, Sell: {sell_ct:,}, Hold: {hold_ct:,}. "
                f"Top feature: {top_feat} (importance={fi[top_feat]:.3f}). "
                f"Median confidence: {conf_p50:.1%}."
            )

            artifact = {
                "clf": clf, "scaler": scaler,
                "feature_cols": _PRED_FEATURE_COLS,
                "buy_idx": buy_idx, "sell_idx": sell_idx,
            }
            metrics  = {
                "train_accuracy":        round(acc, 4),
                "buy_count":             buy_ct,
                "sell_count":            sell_ct,
                "hold_count":            hold_ct,
                "feature_importances":   fi,
                "confidence_p50":        conf_p50,
                "confidence_p90":        conf_p90,
                "optimal_buy_idx":       buy_idx,
                "optimal_sell_idx":      sell_idx,
                "zone_delta":            delta,
            }
            sample = {
                "type":            "signal",
                "signals":         self._downsample_array(preds),
                "confidences":     self._downsample_array([round(c, 4) for c in conf]),
                "feature_importances": fi,
                "optimal_buy_idx": buy_idx,
                "optimal_sell_idx": sell_idx,
                "n_total":         n,
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
            clf       = artifact["clf"]
            scaler    = artifact["scaler"]
            feat_cols = artifact["feature_cols"]

            X_full = extract_point_features(prices)
            X      = X_full[:, feat_cols]
            X_sc   = scaler.transform(X)
            preds  = clf.predict(X_sc).tolist()
            conf   = clf.predict_proba(X_sc).max(axis=1).tolist()

            return PredictionResult(
                model_name="peak_predictor",
                dataset_size=len(prices),
                predictions={
                    "signals":     self._downsample_array(preds),
                    "confidences": self._downsample_array([round(c, 4) for c in conf]),
                    "n_buy":       preds.count(1),
                    "n_sell":      preds.count(2),
                    "n_total":     len(prices),
                },
                metrics={"accuracy_proxy": round(float(np.mean(np.array(conf))), 4)},
            )
        except Exception as exc:
            return PredictionResult(
                model_name="peak_predictor",
                dataset_size=len(prices),
                predictions={},
                metrics={"error": str(exc)},
            )


# ── Kadane for indices ─────────────────────────────────────────────────────────

def _kadane_indices(arr: np.ndarray) -> tuple[int, int]:
    """Return (buy_index, sell_index) for maximum subarray of arr."""
    n = len(arr)
    if n == 0:
        return 0, 0
    max_sum = float("-inf")
    cur_sum = 0.0
    start = end = tmp_start = 0
    for i in range(n):
        cur_sum += arr[i]
        if cur_sum > max_sum:
            max_sum = cur_sum
            start, end = tmp_start, i
        if cur_sum < 0:
            cur_sum  = 0.0
            tmp_start = i + 1
    return int(start), int(end)
