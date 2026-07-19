/**
 * MLView — Phase 6
 *
 * ML Model Manager page. Features:
 *   1. Model selector — 3 animated cards (Anomaly / Regime / Peak Predictor)
 *   2. Configuration panel — dataset selector + dynamic hyperparameter controls
 *   3. Training launcher — with live polling progress bar
 *   4. Results panel — metrics, summary, and result-type-specific visualization:
 *        Anomaly   → anomaly score chart + anomaly index list
 *        Regime    → regime distribution donut + color-coded segments
 *        Predictor → feature importance bar chart + signal counts
 *   5. Job History — all past training jobs with status badges + re-inspect
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, FlaskConical, TrendingUp, BarChart2, PlayCircle,
  CheckCircle, XCircle, Clock, Trash2, RefreshCw, ChevronDown,
  ChevronUp, AlertTriangle, Info
} from 'lucide-react'
import { listModels, startTraining, listJobs, deleteJob } from '../api/ml'
import { listDatasets } from '../api/datasets'
import { useMLPoller } from '../hooks/useMLPoller'
import Spinner from '../components/common/Spinner'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META = {
  queued:    { label: 'Queued',    color: 'var(--text-muted)',  icon: Clock },
  running:   { label: 'Training…', color: 'var(--primary)',    icon: Brain },
  completed: { label: 'Done',      color: 'var(--success)',     icon: CheckCircle },
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          {hp.label}
        </label>
        <select
          className="form-select"
          value={String(value)}
          onChange={(e) => onChange(hp.name, e.target.value)}
          style={{ fontSize: '0.85rem' }}
        >
          {hp.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{hp.description}</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{hp.label}</label>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 700 }}>
          {hp.type === 'float' ? Number(value).toFixed(2) : value}
        </span>
      </div>
      <input
        type="range"
        min={hp.min}
        max={hp.max}
        step={hp.step ?? (hp.type === 'float' ? 0.01 : 1)}
        value={value}
        onChange={(e) => onChange(hp.name, hp.type === 'float' ? parseFloat(e.target.value) : parseInt(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--primary)' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
        <span>{hp.min}</span><span>{hp.description}</span><span>{hp.max}</span>
      </div>
    </div>
  )
}

// ── Model Card ────────────────────────────────────────────────────────────────
function ModelCard({ model, selected, onSelect }) {
  const Icon = MODEL_ICONS[model.name] ?? Brain
  const isSelected = selected?.name === model.name

  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(model)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left',
        padding: '16px', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
        background: isSelected ? `${model.color}12` : 'var(--bg-surface-2)',
        border: `2px solid ${isSelected ? model.color : 'var(--border)'}`,
        transition: 'all 0.18s ease', width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: `${model.color}20`, border: `1px solid ${model.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={17} color={model.color} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {model.display_name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: model.color, marginTop: 2 }}>
            {model.algorithm}
          </div>
        </div>
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {model.description}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px',
          borderRadius: 999, background: `${model.color}15`, color: model.color,
          border: `1px solid ${model.color}30`,
        }}>{model.time_complexity}</span>
        <span style={{
          fontSize: '0.68rem', padding: '2px 8px', borderRadius: 999,
          background: 'var(--bg-surface)', color: 'var(--text-muted)',
          border: '1px solid var(--border)',
        }}>{model.library}</span>
      </div>
    </motion.button>
  )
}

// ── Anomaly Result Viz ────────────────────────────────────────────────────────
function AnomalyViz({ sample, metrics }) {
  const scores  = sample.scores ?? []
  const isAnom  = sample.is_anomaly ?? []
  const n       = sample.n_total ?? scores.length
  const topIdxs = (sample.anomaly_indices ?? []).slice(0, 12)

  const minS = Math.min(...scores.map(Number).filter(isFinite))
  const maxS = Math.max(...scores.map(Number).filter(isFinite))
  const rangeS = maxS - minS || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Score mini-chart */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
          Anomaly Score Distribution (sampled)
        </div>
        <div style={{
          height: 60, display: 'flex', alignItems: 'flex-end', gap: 1,
          background: 'var(--bg-surface)', borderRadius: 8, padding: '8px 8px 0',
          overflow: 'hidden',
        }}>
          {scores.slice(0, 200).map((s, i) => {
            const height = Math.max(4, ((Number(s) - minS) / rangeS) * 52)
            const isA = isAnom[i] === 1
            return (
              <div key={i} style={{
                flex: '0 0 auto', width: 2, height,
                background: isA ? '#ef4444' : '#6366f1',
                borderRadius: 1, opacity: isA ? 1 : 0.4,
              }} />
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} /> Anomaly
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: '#6366f1', opacity: 0.4 }} /> Normal
          </span>
        </div>
      </div>

      {/* Anomaly indices */}
      {topIdxs.length > 0 && (
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
            Top Anomalous Indices (first {topIdxs.length} of {metrics.n_anomalies?.toLocaleString()})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {topIdxs.map((idx) => (
              <span key={idx} style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '3px 8px',
                borderRadius: 6, background: '#ef444420', border: '1px solid #ef444440',
                color: '#ef4444', fontWeight: 600,
              }}>
                {idx.toLocaleString()}
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
  const dist   = sample.distribution   ?? {}
  const colors = sample.regime_colors  ?? {}
  const labels = Object.keys(dist)
  const total  = labels.reduce((s, l) => s + dist[l], 0) || 1

  // Mini timeline strip
  const regimes = sample.regimes ?? []
  const stripCols = regimes.slice(0, 400)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Regime timeline strip */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
          Regime Timeline (sampled)
        </div>
        <div style={{ height: 28, display: 'flex', borderRadius: 6, overflow: 'hidden' }}>
          {stripCols.map((lbl, i) => (
            <div key={i} style={{
              flex: '0 0 auto', width: `${100 / stripCols.length}%`,
              background: colors[lbl] ?? '#94a3b8',
            }} />
          ))}
        </div>
      </div>

      {/* Distribution bars */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
          Regime Distribution
        </div>
        {labels.map((lbl) => {
          const pct = dist[lbl] / total
          const clr = colors[lbl] ?? '#94a3b8'
          return (
            <div key={lbl} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 3 }}>
                <span style={{ fontWeight: 600, color: clr }}>{lbl}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  {(pct * 100).toFixed(1)}%
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--bg-surface)', borderRadius: 999, overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct * 100}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  style={{ height: '100%', background: clr, borderRadius: 999 }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Predictor Result Viz ──────────────────────────────────────────────────────
function PredictorViz({ sample, metrics }) {
  const fi     = sample.feature_importances ?? {}
  const sorted = Object.entries(fi).sort(([, a], [, b]) => b - a)
  const maxFI  = sorted[0]?.[1] ?? 1

  const signals = sample.signals ?? []
  const buyPts  = signals.filter((s) => s === 1).length
  const sellPts = signals.filter((s) => s === 2).length
  const holdPts = signals.filter((s) => s === 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Signal counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { label: 'Buy Signals',  count: buyPts,  color: '#10b981' },
          { label: 'Hold Signals', count: holdPts, color: '#64748b' },
          { label: 'Sell Signals', count: sellPts, color: '#ef4444' },
        ].map(({ label, count, color }) => (
          <div key={label} style={{
            padding: '10px 12px', borderRadius: 10,
            background: `${color}10`, border: `1px solid ${color}30`,
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.1rem', color }}>
              {count.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Feature importances */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
          Feature Importances
        </div>
        {sorted.map(([feat, imp]) => (
          <div key={feat} style={{ marginBottom: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{feat}</span>
              <span style={{ color: 'var(--primary-light)', fontWeight: 600, fontSize: '0.75rem' }}>
                {(imp * 100).toFixed(1)}%
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 999, overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(imp / maxFI) * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{ height: '100%', background: '#10b981', borderRadius: 999 }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Optimal buy/sell from Kadane */}
      {sample.optimal_buy_idx != null && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
          fontSize: '0.78rem', display: 'flex', gap: 20,
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Kadane Buy: </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 700 }}>
              idx {sample.optimal_buy_idx?.toLocaleString()}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Kadane Sell: </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#ef4444', fontWeight: 700 }}>
              idx {sample.optimal_sell_idx?.toLocaleString()}
            </span>
          </div>
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
      padding: '8px 12px', borderRadius: 10, textAlign: 'center',
      background: 'var(--bg-surface)', border: '1px solid var(--border)', flex: 1,
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1rem', color: color ?? 'var(--primary-light)' }}>
        {value}
      </div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
        <CheckCircle size={15} color="var(--success)" />
        <h4 style={{ margin: 0, fontSize: '0.9375rem' }}>Training Results</h4>
        <span style={{
          marginLeft: 'auto', fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
        }}>N={sample.n_total?.toLocaleString()}</span>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Summary */}
        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: 'var(--success-dim)', border: '1px solid var(--success)30',
          fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--text-secondary)',
        }}>
          {job.summary}
        </div>

        {/* Key metrics */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {type === 'anomaly' && <>
            <MetricChip label="Anomalies" value={metrics.n_anomalies?.toLocaleString()} color="#ef4444" />
            <MetricChip label="Rate" value={`${(metrics.anomaly_rate * 100).toFixed(2)}%`} color="#f97316" />
            <MetricChip label="Regions" value={metrics.n_regions} color="#a855f7" />
            <MetricChip label="Trees" value={metrics.n_estimators} />
          </>}
          {type === 'regime' && <>
            <MetricChip label="K Regimes" value={metrics.k} color="#f59e0b" />
            <MetricChip label="Silhouette" value={metrics.silhouette?.toFixed(3)} color={metrics.silhouette >= 0.5 ? 'var(--success)' : metrics.silhouette >= 0.3 ? '#f59e0b' : 'var(--danger)'} />
            <MetricChip label="Windows" value={metrics.n_windows?.toLocaleString()} />
            <MetricChip label="Win. Size" value={metrics.window_size} />
          </>}
          {type === 'signal' && <>
            <MetricChip label="Train Acc." value={`${(metrics.train_accuracy * 100).toFixed(1)}%`} color="var(--success)" />
            <MetricChip label="Buy Zones" value={metrics.buy_count?.toLocaleString()} color="#10b981" />
            <MetricChip label="Sell Zones" value={metrics.sell_count?.toLocaleString()} color="#ef4444" />
            <MetricChip label="Conf. P50" value={`${(metrics.confidence_p50 * 100).toFixed(0)}%`} />
          </>}
        </div>

        {/* Type-specific viz */}
        {type === 'anomaly'  && <AnomalyViz   sample={sample} metrics={metrics} />}
        {type === 'regime'   && <RegimeViz    sample={sample} />}
        {type === 'signal'   && <PredictorViz sample={sample} metrics={metrics} />}
      </div>
    </motion.div>
  )
}

// ── Job History Row ───────────────────────────────────────────────────────────
function JobRow({ job, onDelete, onInspect, selected }) {
  const sm      = STATUS_META[job.status] ?? STATUS_META.queued
  const Icon    = sm.icon

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
      borderBottom: '1px solid var(--border)',
      background: selected ? 'var(--primary-dim)' : 'transparent',
      cursor: 'pointer', transition: 'background 0.15s ease',
    }} onClick={() => onInspect(job)}>
      <Icon size={14} color={sm.color} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-primary)', display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span>#{job.id}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.75rem' }}>
            {job.model_name}
          </span>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          ds#{job.dataset_id} · {job.created_at ? new Date(job.created_at).toLocaleString() : '—'}
        </div>
      </div>
      <span style={{
        fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px',
        borderRadius: 999, background: `${sm.color}15`, color: sm.color,
        border: `1px solid ${sm.color}30`, flexShrink: 0,
      }}>{sm.label}</span>
      <button
        className="btn btn-ghost btn-sm btn-icon"
        onClick={(e) => { e.stopPropagation(); onDelete(job.id) }}
        title="Delete job"
        style={{ flexShrink: 0 }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MLView() {
  const [models,       setModels]       = useState([])
  const [datasets,     setDatasets]     = useState([])
  const [selectedModel, setSelectedModel] = useState(null)
  const [selectedDsId,  setSelectedDsId]  = useState(null)
  const [hyperparams,  setHyperparams]  = useState({})
  const [training,     setTraining]     = useState(false)
  const [trainError,   setTrainError]   = useState(null)
  const [activeJobId,  setActiveJobId]  = useState(null)
  const [jobs,         setJobs]         = useState([])
  const [jobsLoading,  setJobsLoading]  = useState(false)
  const [inspectedJob, setInspectedJob] = useState(null)
  const [historyOpen,  setHistoryOpen]  = useState(true)
  const [loadError,    setLoadError]    = useState(null)

  // ── Load models + datasets ──────────────────────────────────────────────────
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
      .catch((e) => setLoadError(e.message))

    listDatasets(1, 100).then((d) => setDatasets(d.items ?? []))
  }, [])

  const refreshJobs = useCallback(() => {
    setJobsLoading(true)
    listJobs(30)
      .then((d) => setJobs(d.jobs ?? []))
      .finally(() => setJobsLoading(false))
  }, [])

  useEffect(refreshJobs, [refreshJobs])

  // ── Model selection ─────────────────────────────────────────────────────────
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

  // ── Training ────────────────────────────────────────────────────────────────
  const handleTrain = async () => {
    if (!selectedModel || !selectedDsId) return
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
      setTrainError(e.response?.data?.detail ?? e.message)
      setTraining(false)
    }
  }

  // ── Polling ──────────────────────────────────────────────────────────────────
  const { job: polledJob, polling } = useMLPoller(
    activeJobId,
    {
      onComplete: (j) => {
        setTraining(false)
        setInspectedJob(j)
        refreshJobs()
      },
      onFail: (j) => {
        setTraining(false)
        setTrainError(j.error ?? 'Training failed.')
        refreshJobs()
      },
    }
  )

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (jobId) => {
    await deleteJob(jobId)
    if (inspectedJob?.id === jobId) setInspectedJob(null)
    if (activeJobId === jobId)      setActiveJobId(null)
    refreshJobs()
  }

  const canTrain = selectedModel && selectedDsId && !training

  // ── Progress bar for running job ────────────────────────────────────────────
  const progressVal = polledJob?.status === 'running' ? null : null  // indeterminate

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h2 style={{ marginBottom: 4 }}>ML Model Trainer</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Phase 6 — Train machine learning models on price datasets.
          Three models: Isolation Forest (anomaly), K-Means (regime), Gradient Boosting (signals).
        </p>
      </motion.div>

      {loadError && <div className="panel panel-danger">{loadError}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>

        {/* ── LEFT: Config + Results ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Step 1: Model Selection */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Brain size={15} color="var(--primary)" />
              <h4 style={{ margin: 0, fontSize: '0.9375rem' }}>Step 1 — Select Model</h4>
            </div>
            <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {models.map((m) => (
                <ModelCard
                  key={m.name} model={m}
                  selected={selectedModel} onSelect={handleSelectModel}
                />
              ))}
              {models.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}><Spinner /></div>}
            </div>
          </div>

          {/* Step 2: Dataset + Hyperparams */}
          {selectedModel && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <FlaskConical size={15} color="var(--primary)" />
                <h4 style={{ margin: 0, fontSize: '0.9375rem' }}>Step 2 — Configure</h4>
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* Dataset selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Training Dataset</label>
                  <select
                    className="form-select"
                    value={selectedDsId ?? ''}
                    onChange={(e) => setSelectedDsId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— Select a dataset —</option>
                    {datasets.map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        #{ds.id} {ds.name} (N={ds.size?.toLocaleString()})
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Only datasets with a .npy price file can be used for training.
                  </div>
                </div>

                {/* Hyperparameters */}
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12 }}>
                    Hyperparameters — {selectedModel.display_name}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                    {selectedModel.hyperparams.map((hp) => (
                      <HyperparamControl
                        key={hp.name} def={hp}
                        value={hyperparams[hp.name] ?? hp.default}
                        onChange={handleHPChange}
                      />
                    ))}
                  </div>
                </div>

                {/* Use case note */}
                <div style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5,
                }}>
                  <Info size={12} style={{ display: 'inline', marginRight: 6 }} />
                  {selectedModel.use_case}
                </div>

                {/* Train Button */}
                {trainError && (
                  <div className="panel panel-danger" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.82rem' }}>
                    <AlertTriangle size={14} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
                    {trainError}
                  </div>
                )}

                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleTrain}
                  disabled={!canTrain}
                  style={{ justifyContent: 'center' }}
                >
                  {training ? <Spinner size={18} /> : <PlayCircle size={18} />}
                  {training ? 'Training…' : 'Start Training'}
                </button>

                {/* Progress indicator */}
                {training && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ height: 4, background: 'var(--bg-surface)', borderRadius: 999, overflow: 'hidden' }}>
                      <motion.div
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                        style={{
                          height: '100%', width: '50%',
                          background: `linear-gradient(90deg, transparent, ${selectedModel?.color ?? 'var(--primary)'}, transparent)`,
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                      {polledJob?.status === 'running' ? 'Model is training in the background…' : 'Queued — waiting for thread…'}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: Results */}
          <AnimatePresence>
            {inspectedJob && <ResultPanel key={inspectedJob.id} job={inspectedJob} />}
          </AnimatePresence>
        </div>

        {/* ── RIGHT: Job History ── */}
        <div style={{ position: 'sticky', top: 24 }}>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div
              style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              }}
              onClick={() => setHistoryOpen((o) => !o)}
            >
              <h4 style={{ margin: 0, fontSize: '0.9rem', flex: 1 }}>
                Training History
                {jobs.length > 0 && (
                  <span style={{
                    marginLeft: 8, fontSize: '0.7rem', fontWeight: 700,
                    padding: '1px 7px', borderRadius: 999,
                    background: 'var(--primary-dim)', color: 'var(--primary-light)',
                    border: '1px solid var(--border-active)',
                  }}>{jobs.length}</span>
                )}
              </h4>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={(e) => { e.stopPropagation(); refreshJobs() }}>
                <RefreshCw size={12} />
              </button>
              {historyOpen ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
            </div>

            <AnimatePresence>
              {historyOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: 'hidden' }}
                >
                  {jobsLoading && <div style={{ padding: 16 }}><Spinner center /></div>}
                  {!jobsLoading && jobs.length === 0 && (
                    <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      No training jobs yet. Start your first training above.
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Model quick reference */}
          <div style={{
            marginTop: 14, padding: '14px 16px',
            background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Algorithm Reference
            </div>
            {[
              { name: 'Isolation Forest', complexity: 'O(N·t·log ψ)', color: '#ef4444', note: 'Ensemble trees; anomalies isolated in fewer splits' },
              { name: 'K-Means',          complexity: 'O(N·K·I)',      color: '#f59e0b', note: 'Minimizes within-cluster SSE; validated by silhouette' },
              { name: 'Gradient Boost',   complexity: 'O(N·M·D)',      color: '#10b981', note: 'Additive CART stumps; labels from Kadane\'s solution' },
            ].map(({ name, complexity, color, note }) => (
              <div key={name} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.78rem', color }}>{name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{complexity}</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{note}</div>
              </div>
            ))}
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>N = dataset size · t = trees · K = clusters · M = boosting rounds · D = tree depth</div>
          </div>
        </div>
      </div>
    </div>
  )
}
