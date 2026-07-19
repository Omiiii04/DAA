/**
 * SweepPanel — Phase 4
 *
 * Interactive panel for launching and monitoring multi-size complexity sweeps.
 * Features:
 *   - Predefined size toggles (1K → 100K) with BF safety warning
 *   - Algorithm checkboxes
 *   - Distribution selector
 *   - Animated step matrix (size × algorithm grid)
 *   - Real-time fitness scores as steps complete
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, AlertTriangle, CheckCircle, XCircle, Loader, SkipForward } from 'lucide-react'
import { getSweepConfig, startSweep } from '../../api/complexity'
import { useSweepPoller } from '../../hooks/useSweepPoller'
import Spinner from '../common/Spinner'

const BF_MAX = 20_000

const ALGO_COLORS = {
  'Brute Force':        '#ef4444',
  'Divide & Conquer':   '#f59e0b',
  "Kadane's Algorithm": '#10b981',
}

const STATUS_ICON = {
  pending:   <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>○</span>,
  running:   <Loader size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />,
  done:      <CheckCircle size={13} color="var(--success)" />,
  skipped:   <SkipForward size={13} color="var(--text-muted)" />,
  error:     <XCircle size={13} color="var(--danger)" />,
}

const DISTRIBUTION_LABELS = {
  random:           'Random Walk',
  mostly_positive:  'Bull Market',
  mostly_negative:  'Bear Market',
  high_volatility:  'High Volatility',
  low_volatility:   'Low Volatility',
}

// ── Size Toggle Button ─────────────────────────────────────────────────────────
function SizeToggle({ size, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(size)}
      style={{
        padding: '7px 12px',
        borderRadius: 'var(--radius)',
        border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        background: selected ? 'var(--primary-dim)' : 'var(--bg-surface-2)',
        color: selected ? 'var(--primary-light)' : 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8125rem',
        fontWeight: selected ? 700 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {size >= 1000 ? `${(size / 1000).toFixed(0)}K` : size}
    </button>
  )
}

// ── Step Matrix ────────────────────────────────────────────────────────────────
function StepMatrix({ steps, algorithms, sizes }) {
  if (!steps?.length) return null

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 2px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 10px', fontWeight: 600 }}>
              Algorithm
            </th>
            {sizes.map((sz) => (
              <th key={sz} style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 8px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                N={sz >= 1000 ? `${sz / 1000}K` : sz}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {algorithms.map((algo) => {
            const color = ALGO_COLORS[algo] ?? '#94a3b8'
            return (
              <tr key={algo} style={{ background: 'var(--bg-surface-2)', borderRadius: 'var(--radius)' }}>
                <td style={{ padding: '6px 10px', fontSize: '0.8125rem', fontWeight: 600, color }}>
                  {algo}
                </td>
                {sizes.map((sz) => {
                  const step = steps.find((s) => s.size === sz && s.algorithm === algo)
                  return (
                    <td key={sz} style={{ textAlign: 'center', padding: '6px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
                        {STATUS_ICON[step?.status ?? 'pending']}
                        {step?.status === 'done' && step.mean_ms > 0 && (
                          <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color, lineHeight: 1.2 }}>
                            {step.mean_ms < 1
                              ? `${(step.mean_ms * 1000).toFixed(0)}µs`
                              : `${step.mean_ms.toFixed(2)}ms`}
                          </div>
                        )}
                        {step?.status === 'error' && (
                          <div style={{ fontSize: '0.6rem', color: 'var(--danger)' }} title={step.error}>ERR</div>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Fitness Chips ──────────────────────────────────────────────────────────────
function FitnessChips({ analyses }) {
  if (!analyses || Object.keys(analyses).length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
      {Object.entries(analyses).map(([name, a]) => {
        const pct = Math.round((a.fitness_score ?? 0) * 100)
        const color = ALGO_COLORS[name] ?? '#94a3b8'
        const barColor = pct >= 85 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)'
        return (
          <div key={name} style={{
            background: 'var(--bg-surface-2)',
            border: `1px solid ${color}25`,
            borderRadius: 'var(--radius)',
            padding: '10px 14px',
            minWidth: 140,
          }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{name}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.25rem', color }}>
                {pct}%
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>fit</span>
            </div>
            <div style={{ height: 4, background: 'var(--bg-surface-3)', borderRadius: 999 }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: barColor,
                borderRadius: 999,
                transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {a.complexity} · R̄={a.mean_growth_ratio?.toFixed(2)}×
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SweepPanel({ onSweepComplete }) {
  const [config,      setConfig]      = useState(null)
  const [sizes,       setSizes]       = useState([1_000, 5_000, 10_000, 20_000, 50_000])
  const [algorithms,  setAlgorithms]  = useState(['Brute Force', 'Divide & Conquer', "Kadane's Algorithm"])
  const [distribution, setDist]       = useState('random')
  const [jobId,       setJobId]       = useState(null)
  const [launching,   setLaunching]   = useState(false)
  const [launchError, setLaunchError] = useState(null)

  const { job, error: pollError } = useSweepPoller(jobId, 1500)

  // Load config on mount
  useEffect(() => {
    getSweepConfig().then(setConfig).catch(() => {})
  }, [])

  // Notify parent when sweep completes
  useEffect(() => {
    if (job?.status === 'completed') {
      onSweepComplete?.(job.analyses)
    }
  }, [job?.status])

  const toggleSize = (size) => {
    setSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size].sort((a, b) => a - b)
    )
  }

  const toggleAlgo = (algo) => {
    setAlgorithms((prev) =>
      prev.includes(algo) ? prev.filter((a) => a !== algo) : [...prev, algo]
    )
  }

  const handleLaunch = async () => {
    if (sizes.length === 0 || algorithms.length === 0) return
    setLaunching(true)
    setLaunchError(null)
    setJobId(null)
    try {
      const result = await startSweep({
        sizes,
        algorithms,
        distribution_type: distribution,
        seed: null,
      })
      setJobId(result.job_id)
    } catch (err) {
      setLaunchError(err.response?.data?.detail ?? err.message)
    } finally {
      setLaunching(false)
    }
  }

  const isRunning = job?.status === 'running' || job?.status === 'queued' || launching
  const isDone    = job?.status === 'completed'
  const hasBFSizeOverLimit = sizes.some((s) => s > BF_MAX) && algorithms.includes('Brute Force')

  const allSizes = config?.recommended_sizes ?? [1_000, 5_000, 10_000, 20_000, 50_000, 100_000]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Config Area ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Size Selection */}
        <div>
          <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
            Dataset Sizes
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {allSizes.map((sz) => (
              <SizeToggle key={sz} size={sz} selected={sizes.includes(sz)} onToggle={toggleSize} />
            ))}
          </div>
          {hasBFSizeOverLimit && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '0.75rem', color: 'var(--warning)' }}>
              <AlertTriangle size={12} style={{ marginTop: 1, flexShrink: 0 }} />
              Brute Force will be auto-skipped for N &gt; {BF_MAX.toLocaleString()} (O(N²) safety limit).
            </div>
          )}
        </div>

        {/* Algorithms */}
        <div>
          <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Algorithms</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(config?.algorithms ?? ['Brute Force', 'Divide & Conquer', "Kadane's Algorithm"]).map((algo) => {
              const selected = algorithms.includes(algo)
              const color = ALGO_COLORS[algo] ?? '#94a3b8'
              return (
                <button
                  key={algo}
                  type="button"
                  onClick={() => toggleAlgo(algo)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius)',
                    border: `1.5px solid ${selected ? color : 'var(--border)'}`,
                    background: selected ? `${color}15` : 'var(--bg-surface-2)',
                    color: selected ? color : 'var(--text-muted)',
                    fontSize: '0.8125rem',
                    fontWeight: selected ? 700 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {algo}
                </button>
              )
            })}
          </div>
        </div>

        {/* Distribution */}
        <div className="form-group">
          <label className="form-label">GBM Distribution Profile</label>
          <select
            className="form-select"
            value={distribution}
            onChange={(e) => setDist(e.target.value)}
            style={{ maxWidth: 260 }}
          >
            {Object.entries(DISTRIBUTION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {launchError && (
          <div className="panel panel-danger" style={{ fontSize: '0.875rem' }}>{launchError}</div>
        )}
        {pollError && (
          <div className="panel panel-danger" style={{ fontSize: '0.875rem' }}>{pollError}</div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleLaunch}
          disabled={isRunning || sizes.length === 0 || algorithms.length === 0}
          style={{ alignSelf: 'flex-start', gap: 8 }}
        >
          {launching ? <Spinner size={16} /> : <Zap size={16} />}
          {isRunning ? 'Running…' : isDone ? 'Re-run Sweep' : 'Run Complexity Sweep'}
        </button>
      </div>

      {/* ── Progress Area ── */}
      <AnimatePresence>
        {job && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            {/* Progress bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {job.current_description || `${job.status}…`}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 700,
                  color: isDone ? 'var(--success)' : 'var(--primary)' }}>
                  {job.progress_pct}%
                </div>
              </div>
              <div className="progress-bar" style={{ height: 8 }}>
                <div className="progress-fill" style={{
                  width: `${job.progress_pct}%`,
                  transition: 'width 0.6s ease',
                  background: isDone
                    ? 'linear-gradient(90deg, var(--success), #34d399)'
                    : 'linear-gradient(90deg, var(--primary), var(--primary-light))',
                }} />
              </div>
              <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {job.completed_steps} / {job.total_steps} benchmarks completed
                {job.status === 'completed' && (
                  <span style={{ color: 'var(--success)', marginLeft: 8 }}>✓ Done</span>
                )}
              </div>
            </div>

            {/* Step Matrix */}
            <StepMatrix
              steps={job.steps}
              algorithms={job.algorithms}
              sizes={job.sizes}
            />

            {/* Fitness Chips (real-time) */}
            {Object.keys(job.analyses ?? {}).length > 0 && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Live Fitness Scores
                </div>
                <FitnessChips analyses={job.analyses} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
