/**
 * MLView — Phase 6
 *
 * ML Model Manager page. Features:
 *   1. Model selector — 3 selectable cards (Anomaly / Regime / Peak Predictor)
 *   2. Configuration panel — dataset selector + dynamic hyperparameter controls
 *   3. Training launcher — with live polling progress indicator
 *   4. Results panel — metrics, summary, and result-type-specific visualization:
 *        Anomaly   → anomaly score chart + anomaly index list
 *        Regime    → regime distribution + color-coded timeline segments
 *        Predictor → feature importance bar chart + signal counts
 *   5. Job History — past training jobs with status badges, delete, and re-inspect
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Brain, FlaskConical, TrendingUp, BarChart2, PlayCircle,
  CheckCircle, XCircle, Clock, Trash2, RefreshCw, ChevronDown,
  ChevronUp, AlertCircle, Info, AlertTriangle
} from 'lucide-react'
import { listModels, startTraining, listJobs, deleteJob } from '../api/ml'
import { listDatasets } from '../api/datasets'
import { useMLPoller } from '../hooks/useMLPoller'
import Spinner from '../components/common/Spinner'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META = {
  queued:    { label: 'Queued',    color: 'var(--text-muted)',  icon: Clock },
  running:   { label: 'Training…', color: 'var(--primary-light)', icon: Brain },
  completed: { label: 'Complete',  color: 'var(--success)',     icon: CheckCircle },
  failed:    { label: 'Failed',    color: 'var(--danger)',      icon: XCircle },
}

const MODEL_ICONS = {
  anomaly_detector:  FlaskConical,
  regime_classifier: TrendingUp,
  peak_predictor:    BarChart2,
}

// ── Hyperparameter Control ────────────────────────────────────────────────────
function HyperparamControl({ def: hp, value, onChange }) {
  if (hp.type === 'select') {
    return (
      <div className="form-group">
        <label htmlFor={`hp-${hp.name}`} className="form-label">
          {hp.label}
        </label>
        <select
          id={`hp-${hp.name}`}
          className="form-select"
          value={String(value)}
          onChange={(e) => onChange(hp.name, e.target.value)}
        >
          {hp.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{hp.description}</div>
      </div>
    )
  }

  const numericValue = typeof value === 'number' ? value : hp.default

  return (
    <div className="form-group">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label htmlFor={`hp-${hp.name}`} className="form-label">{hp.label}</label>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 600 }}>
          {hp.type === 'float' ? numericValue.toFixed(2) : numericValue}
        </span>
      </div>
      <input
        id={`hp-${hp.name}`}
        type="range"
        className="form-range"
        min={hp.min}
        max={hp.max}
        step={hp.step ?? (hp.type === 'float' ? 0.01 : 1)}
        value={numericValue}
        onChange={(e) => {
          const val = hp.type === 'float' ? parseFloat(e.target.value) : parseInt(e.target.value, 10)
          onChange(hp.name, val)
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
        <span>Min: {hp.min}</span>
        <span>{hp.description}</span>
        <span>Max: {hp.max}</span>
      </div>
    </div>
  )
}

// ── Model Card ────────────────────────────────────────────────────────────────
function ModelCard({ model, selected, onSelect }) {
  const Icon = MODEL_ICONS[model.name] ?? Brain
  const isSelected = selected?.name === model.name

  return (
    <button
      type="button"
      onClick={() => onSelect(model)}
      aria-pressed={isSelected}
      style={{
        display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left',
        padding: '16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        background: 'var(--surface)',
        boxShadow: isSelected ? 'var(--shadow-inset)' : 'var(--shadow-raised-sm)',
        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--card-border)'}`,
        borderLeft: `4px solid ${model.color}`,
        transition: 'all var(--transition-fast)',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 'var(--radius-xs)', flexShrink: 0,
          background: 'var(--surface)',
          boxShadow: isSelected ? 'var(--shadow-raised-sm)' : 'var(--shadow-inset)',
          border: '1px solid var(--input-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} color={model.color} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>
            {model.display_name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: model.color, marginTop: 2, fontWeight: 600 }}>
            {model.algorithm}
          </div>
        </div>
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {model.description}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
        <span className="badge badge-muted">{model.time_complexity}</span>
        <span className="badge badge-muted">{model.library}</span>
      </div>
    </button>
  )
}

// ── Anomaly Result Viz ────────────────────────────────────────────────────────
function AnomalyViz({ sample, metrics }) {
  const scores  = sample?.scores ?? []
  const isAnom  = sample?.is_anomaly ?? []
  const topIdxs = (sample?.anomaly_indices ?? []).slice(0, 16)

  const validScores = scores.map(Number).filter(isFinite)
  const minS = validScores.length > 0 ? Math.min(...validScores) : 0
  const maxS = validScores.length > 0 ? Math.max(...validScores) : 1
  const rangeS = (maxS - minS) || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Score mini-chart */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
          Anomaly Score Profile (sampled window)
        </div>
        <div style={{
          height: 56, display: 'flex', alignItems: 'flex-end', gap: 1,
          background: 'var(--bg-surface)', borderRadius: 'var(--radius)', padding: '6px 8px 0',
          border: '1px solid var(--border)', overflow: 'hidden',
        }}>
          {scores.slice(0, 200).map((s, i) => {
            const height = Math.max(3, ((Number(s) - minS) / rangeS) * 48)
            const isA = isAnom[i] === 1
            return (
              <div key={i} style={{
                flex: '0 0 auto', width: 2, height,
                background: isA ? 'var(--danger)' : 'var(--primary-light)',
                borderRadius: 1, opacity: isA ? 1 : 0.4,
              }} />
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--danger)' }} /> Anomaly Point
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--primary-light)', opacity: 0.5 }} /> Normal
          </span>
        </div>
      </div>

      {/* Anomaly indices */}
      {topIdxs.length > 0 && (
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
            Prominent Anomalous Timestamps (Top {topIdxs.length} of {metrics.n_anomalies?.toLocaleString()})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {topIdxs.map((idx) => (
              <span key={idx} style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.72rem', padding: '2px 6px',
                borderRadius: 'var(--radius-sm)', background: 'var(--danger-dim)', border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'var(--danger)', fontWeight: 600,
              }}>
                idx {idx.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Regime Result Viz ─────────────────────────────────────────────────────────
function RegimeViz({ sample }) {
  const dist    = sample?.distribution ?? {}
  const colors  = sample?.regime_colors ?? {}
  const labels  = Object.keys(dist)
  const total   = labels.reduce((s, l) => s + (dist[l] ?? 0), 0) || 1

  const regimes   = sample?.regimes ?? []
  const stripCols = regimes.slice(0, 300)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Regime timeline strip */}
      {stripCols.length > 0 && (
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
            Regime Trajectory Sample
          </div>
          <div style={{ height: 20, display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)' }}>
            {stripCols.map((lbl, i) => (
              <div key={i} style={{
                flex: '0 0 auto', width: `${100 / stripCols.length}%`,
                background: colors[lbl] ?? '#94a3b8',
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Distribution bars */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
          Regime Cluster Proportions
        </div>
        {labels.map((lbl) => {
          const count = dist[lbl] ?? 0
          const pct = count / total
          const clr = colors[lbl] ?? 'var(--primary)'
          return (
            <div key={lbl} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: clr }}>{lbl}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {(pct * 100).toFixed(1)}% ({count.toLocaleString()})
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct * 100}%`, background: clr, borderRadius: 'var(--radius-full)' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Predictor Result Viz ──────────────────────────────────────────────────────
function PredictorViz({ sample }) {
  const fi     = sample?.feature_importances ?? {}
  const sorted = Object.entries(fi).sort(([, a], [, b]) => b - a)
  const maxFI  = sorted[0]?.[1] || 1

  const signals = sample?.signals ?? []
  const buyPts  = signals.filter((s) => s === 1).length
  const holdPts = signals.filter((s) => s === 0).length
  const sellPts = signals.filter((s) => s === 2).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Signal counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { label: 'Buy Signals (+1)',  count: buyPts,  color: '#10b981' },
          { label: 'Hold Signals (0)',  count: holdPts, color: 'var(--text-muted)' },
          { label: 'Sell Signals (-1)', count: sellPts, color: '#ef4444' },
        ].map(({ label, count, color }) => (
          <div key={label} style={{
            padding: '8px 10px', borderRadius: 'var(--radius)',
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1rem', color }}>
              {count.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Feature importances */}
      {sorted.length > 0 && (
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
            Gradient Boosting Feature Importances
          </div>
          {sorted.map(([feat, imp]) => (
            <div key={feat} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 2 }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{feat}</span>
                <span style={{ color: 'var(--primary-light)', fontWeight: 600, fontSize: '0.72rem' }}>
                  {(imp * 100).toFixed(1)}%
                </span>
              </div>
              <div style={{ height: 5, background: 'var(--bg-surface)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(imp / maxFI) * 100}%`, background: 'var(--success)', borderRadius: 'var(--radius-full)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Result Panel ──────────────────────────────────────────────────────────────
function ResultPanel({ job }) {
  if (!job || job.status !== 'completed') return null

  const sample  = job.sample  ?? {}
  const metrics = job.metrics ?? {}
  const type    = sample.type

  const MetricChip = ({ label, value, color }) => (
    <div style={{
      padding: '8px 12px', borderRadius: 'var(--radius)', textAlign: 'center',
      background: 'var(--bg-surface)', border: '1px solid var(--border)', flex: 1, minWidth: 100,
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9375rem', color: color ?? 'var(--primary-light)' }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <CheckCircle size={15} color="var(--success)" />
        <h4 style={{ margin: 0, fontSize: '0.875rem' }}>Model Training Results</h4>
        <span style={{
          marginLeft: 'auto', fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
        }}>N={sample.n_total?.toLocaleString()}</span>
      </div>

      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Summary */}
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--radius)',
          background: 'var(--success-dim)', border: '1px solid rgba(16, 185, 129, 0.3)',
          fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--text-primary)',
        }}>
          {job.summary}
        </div>

        {/* Key metrics */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {type === 'anomaly' && (
            <>
              <MetricChip label="Anomalies" value={metrics.n_anomalies?.toLocaleString()} color="#ef4444" />
              <MetricChip label="Anomaly Rate" value={`${((metrics.anomaly_rate ?? 0) * 100).toFixed(2)}%`} color="#f59e0b" />
              <MetricChip label="Regions" value={metrics.n_regions} />
              <MetricChip label="Trees" value={metrics.n_estimators} />
            </>
          )}
          {type === 'regime' && (
            <>
              <MetricChip label="Clusters (K)" value={metrics.k} color="#f59e0b" />
              <MetricChip
                label="Silhouette"
                value={typeof metrics.silhouette === 'number' ? metrics.silhouette.toFixed(3) : '—'}
                color={(metrics.silhouette ?? 0) >= 0.5 ? 'var(--success)' : 'var(--warning)'}
              />
              <MetricChip label="Windows" value={metrics.n_windows?.toLocaleString()} />
              <MetricChip label="Win. Size" value={metrics.window_size} />
            </>
          )}
          {type === 'signal' && (
            <>
              <MetricChip label="Train Acc." value={`${((metrics.train_accuracy ?? 0) * 100).toFixed(1)}%`} color="var(--success)" />
              <MetricChip label="Buy Signals" value={metrics.buy_count?.toLocaleString()} color="#10b981" />
              <MetricChip label="Sell Signals" value={metrics.sell_count?.toLocaleString()} color="#ef4444" />
              <MetricChip label="Confidence P50" value={`${((metrics.confidence_p50 ?? 0) * 100).toFixed(0)}%`} />
            </>
          )}
        </div>

        {/* Type-specific viz */}
        {type === 'anomaly'  && <AnomalyViz   sample={sample} metrics={metrics} />}
        {type === 'regime'   && <RegimeViz    sample={sample} />}
        {type === 'signal'   && <PredictorViz sample={sample} metrics={metrics} />}
      </div>
    </div>
  )
}

// ── Job History Row ───────────────────────────────────────────────────────────
function JobRow({ job, onDelete, onInspect, selected }) {
  const sm   = STATUS_META[job.status] ?? STATUS_META.queued
  const Icon = sm.icon

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--bg-surface-3)' : 'transparent',
        cursor: 'pointer', transition: 'background-color var(--transition-fast)',
      }}
      onClick={() => onInspect(job)}
    >
      <Icon size={14} color={sm.color} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-primary)', display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span>#{job.id}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.72rem' }}>
            {job.model_name}
          </span>
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          Dataset #{job.dataset_id} · {job.created_at ? new Date(job.created_at).toLocaleDateString() : '—'}
        </div>
      </div>
      <span className={`badge badge-${job.status === 'completed' ? 'success' : job.status === 'failed' ? 'danger' : 'muted'}`}>
        {sm.label}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-icon"
        onClick={(e) => { e.stopPropagation(); onDelete(job.id) }}
        title="Delete job"
        aria-label={`Delete job #${job.id}`}
        style={{ flexShrink: 0 }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MLView() {
  const [models,        setModels]        = useState([])
  const [datasets,      setDatasets]      = useState([])
  const [selectedModel, setSelectedModel] = useState(null)
  const [selectedDsId,  setSelectedDsId]  = useState(null)
  const [hyperparams,   setHyperparams]   = useState({})
  const [training,      setTraining]      = useState(false)
  const [trainError,    setTrainError]    = useState(null)
  const [activeJobId,   setActiveJobId]   = useState(null)
  const [jobs,          setJobs]          = useState([])
  const [jobsLoading,   setJobsLoading]   = useState(false)
  const [inspectedJob,  setInspectedJob]  = useState(null)
  const [historyOpen,   setHistoryOpen]   = useState(true)
  const [loadError,     setLoadError]     = useState(null)
  const [deleteError,   setDeleteError]   = useState(null)

  // Load models + datasets
  useEffect(() => {
    listModels()
      .then((d) => {
        setModels(d.models ?? [])
        if (d.models?.length) {
          const first = d.models[0]
          setSelectedModel(first)
          const defaults = {}
          first.hyperparams.forEach((hp) => { defaults[hp.name] = hp.default })
          setHyperparams(defaults)
        }
      })
      .catch((e) => setLoadError(e.response?.data?.detail ?? e.message ?? 'Failed to fetch registered models.'))

    listDatasets(1, 100)
      .then((d) => setDatasets(d.items ?? []))
      .catch(() => {})
  }, [])

  const refreshJobs = useCallback(() => {
    setJobsLoading(true)
    listJobs(30)
      .then((d) => setJobs(d.jobs ?? []))
      .catch(() => {})
      .finally(() => setJobsLoading(false))
  }, [])

  useEffect(refreshJobs, [refreshJobs])

  const handleSelectModel = (model) => {
    setSelectedModel(model)
    const defaults = {}
    model.hyperparams.forEach((hp) => { defaults[hp.name] = hp.default })
    setHyperparams(defaults)
    setInspectedJob(null)
    setActiveJobId(null)
    setTrainError(null)
  }

  const handleHPChange = (name, value) => {
    setHyperparams((prev) => ({ ...prev, [name]: value }))
  }

  const handleTrain = async () => {
    if (!selectedModel || !selectedDsId || training) return
    setTraining(true)
    setTrainError(null)
    setInspectedJob(null)
    try {
      const res = await startTraining({
        dataset_id:  selectedDsId,
        model_name:  selectedModel.name,
        hyperparams: hyperparams,
      })
      setActiveJobId(res.job_id)
      refreshJobs()
    } catch (e) {
      setTrainError(e.response?.data?.detail ?? e.message ?? 'Failed to initiate training.')
      setTraining(false)
    }
  }

  const { job: polledJob } = useMLPoller(
    activeJobId,
    {
      onComplete: (j) => {
        setTraining(false)
        setInspectedJob(j)
        refreshJobs()
      },
      onFail: (j) => {
        setTraining(false)
        setTrainError(j.error ?? 'Model training failed.')
        refreshJobs()
      },
    }
  )

  const handleDelete = async (jobId) => {
    if (!window.confirm(`Delete training job #${jobId} and its disk artifact?`)) return
    setDeleteError(null)
    try {
      await deleteJob(jobId)
      if (inspectedJob?.id === jobId) setInspectedJob(null)
      if (activeJobId === jobId)      setActiveJobId(null)
      refreshJobs()
    } catch (err) {
      setDeleteError(err.response?.data?.detail ?? err.message ?? 'Failed to delete job.')
    }
  }

  const canTrain = selectedModel && selectedDsId && !training

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header Info */}
      <div>
        <h2 style={{ marginBottom: 4 }}>Machine Learning Trainer</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Train machine learning models on price series data: Isolation Forest for anomaly detection, K-Means for market regime clustering, and Gradient Boosting for trading signal prediction.
        </p>
      </div>

      {loadError && (
        <div className="panel panel-danger" style={{ fontSize: '0.8125rem' }}>
          <AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />
          {loadError}
        </div>
      )}

      {deleteError && (
        <div className="panel panel-danger" style={{ fontSize: '0.8125rem' }}>
          <AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />
          {deleteError}
        </div>
      )}

      <div className="ml-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

        {/* ── LEFT: Config + Results ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Step 1: Model Selection */}
          <div className="card">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--divider)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <Brain size={18} color="var(--accent)" />
              <h4 style={{ margin: 0, fontSize: '0.9375rem' }}>Step 1 — Choose Model Architecture</h4>
            </div>
            <div className="ml-models-grid" style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {models.map((m) => (
                <ModelCard
                  key={m.name} model={m}
                  selected={selectedModel} onSelect={handleSelectModel}
                />
              ))}
              {models.length === 0 && !loadError && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>
                  <Spinner size={18} />
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Dataset + Hyperparameters */}
          {selectedModel && (
            <div className="card">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--divider)', display: 'flex', gap: 10, alignItems: 'center' }}>
                <FlaskConical size={18} color="var(--accent)" />
                <h4 style={{ margin: 0, fontSize: '0.9375rem' }}>Step 2 — Configure Training Dataset &amp; Hyperparameters</h4>
              </div>
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Dataset selector */}
                <div className="form-group">
                  <label htmlFor="ml-dataset-select" className="form-label">Training Dataset</label>
                  <select
                    id="ml-dataset-select"
                    className="form-select"
                    value={selectedDsId ?? ''}
                    onChange={(e) => setSelectedDsId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— Select a dataset to train on —</option>
                    {datasets.map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        #{ds.id} {ds.name} (N={ds.size?.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Hyperparameters */}
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
                    Hyperparameters — {selectedModel.display_name}
                  </div>
                  <div className="form-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {selectedModel.hyperparams.map((hp) => (
                      <HyperparamControl
                        key={hp.name} def={hp}
                        value={hyperparams[hp.name] ?? hp.default}
                        onChange={handleHPChange}
                      />
                    ))}
                  </div>
                </div>

                {/* Use case info */}
                <div className="panel panel-info" style={{ fontSize: '0.78rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Info size={13} color="var(--info)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>{selectedModel.use_case}</div>
                </div>

                {/* Train Error */}
                {trainError && (
                  <div className="panel panel-danger" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.8125rem' }}>
                    <AlertTriangle size={14} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{trainError}</span>
                  </div>
                )}

                {/* Train Button */}
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleTrain}
                  disabled={!canTrain}
                  style={{ justifyContent: 'center' }}
                >
                  {training ? <Spinner size={16} /> : <PlayCircle size={16} />}
                  {training ? 'Training in background…' : 'Start Model Training'}
                </button>

                {/* Progress bar */}
                {training && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="progress-bar" style={{ height: 4 }}>
                      <div className="progress-fill" style={{ width: '100%', animation: 'shimmer 1.5s infinite' }} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                      {polledJob?.status === 'running' ? 'Training model worker thread active…' : 'Queued — initializing worker…'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Results Display */}
          {inspectedJob && <ResultPanel job={inspectedJob} />}
        </div>

        {/* ── RIGHT: Training History ── */}
        <div style={{ position: 'sticky', top: 16 }}>
          <div className="card">
            <div
              style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              }}
              onClick={() => setHistoryOpen((o) => !o)}
            >
              <h4 style={{ margin: 0, fontSize: '0.875rem', flex: 1 }}>
                Training History
                {jobs.length > 0 && (
                  <span className="badge badge-primary" style={{ marginLeft: 6 }}>{jobs.length}</span>
                )}
              </h4>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                onClick={(e) => { e.stopPropagation(); refreshJobs() }}
                title="Refresh jobs"
                aria-label="Refresh training jobs"
              >
                <RefreshCw size={12} />
              </button>
              {historyOpen ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
            </div>

            {historyOpen && (
              <div>
                {jobsLoading && <div style={{ padding: 16 }}><Spinner center /></div>}
                {!jobsLoading && jobs.length === 0 && (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                    No completed training jobs yet. Choose a model above to begin.
                  </div>
                )}
                {jobs.map((j) => (
                  <JobRow
                    key={j.id} job={j}
                    onDelete={handleDelete}
                    onInspect={setInspectedJob}
                    selected={inspectedJob?.id === j.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Model complexity summary card */}
          <div style={{
            marginTop: 16, padding: '16px 18px',
            background: 'var(--surface)', border: '1px solid var(--card-border)',
            boxShadow: 'var(--shadow-raised-sm)',
            borderRadius: 'var(--radius-sm)',
          }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Model Complexity Reference
            </div>
            {[
              { name: 'Isolation Forest', complexity: 'O(N·t·log ψ)', color: 'var(--algo-bf)' },
              { name: 'K-Means',          complexity: 'O(N·K·I)',      color: 'var(--algo-dc)' },
              { name: 'Gradient Boost',   complexity: 'O(N·M·D)',      color: 'var(--algo-kadane)' },
            ].map(({ name, complexity, color }) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color }}>{name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{complexity}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
