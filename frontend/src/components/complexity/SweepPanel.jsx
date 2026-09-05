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
import { Zap, AlertTriangle, CheckCircle, XCircle, Loader, SkipForward } from 'lucide-react'
import { getSweepConfig, startSweep } from '../../api/complexity'
import { useSweepPoller } from '../../hooks/useSweepPoller'
import Spinner from '../common/Spinner'

const BF_MAX = 20_000

const ALGO_COLORS = {
  'Brute Force':        'var(--algo-bf)',
  'Divide & Conquer':   'var(--algo-dc)',
  "Kadane's Algorithm": 'var(--algo-kadane)',
}

const STATUS_ICON = {
  pending:   <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>○</span>,
  running:   <Loader size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />,
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
      aria-pressed={selected}
      style={{
        padding: '8px 14px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--card-border)'}`,
        background: 'var(--surface)',
        boxShadow: selected ? 'var(--shadow-inset)' : 'var(--shadow-raised-sm)',
        color: selected ? 'var(--accent)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8125rem',
        fontWeight: selected ? 700 : 500,
        cursor: 'pointer',
        minHeight: 44,
        transition: 'all var(--transition-fast)',
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
    <div className="table-wrapper">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead>
          <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
            <th style={{ textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', padding: '8px 12px', fontWeight: 600, textTransform: 'uppercase' }}>
              Algorithm
            </th>
            {sizes.map((sz) => (
              <th key={sz} style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', padding: '8px 10px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                N={sz >= 1000 ? `${sz / 1000}K` : sz}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {algorithms.map((algo) => {
            const color = ALGO_COLORS[algo] ?? 'var(--text-primary)'
            return (
              <tr key={algo} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', fontSize: '0.8125rem', fontWeight: 600, color }}>
                  {algo}
                </td>
                {sizes.map((sz) => {
                  const step = steps.find((s) => s.size === sz && s.algorithm === algo)
                  return (
                    <td key={sz} style={{ textAlign: 'center', padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
                        {STATUS_ICON[step?.status ?? 'pending']}
                        {step?.status === 'done' && step.mean_ms > 0 && (
                          <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color, lineHeight: 1.1 }}>
                            {step.mean_ms < 1
                              ? `${(step.mean_ms * 1000).toFixed(0)}µs`
                              : `${step.mean_ms.toFixed(2)}ms`}
                          </div>
                        )}
                        {step?.status === 'error' && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--danger)' }} title={step.error}>ERR</div>
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
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
      {Object.entries(analyses).map(([name, a]) => {
        const pct = Math.round((a.fitness_score ?? 0) * 100)
        const color = ALGO_COLORS[name] ?? 'var(--primary)'
        const barColor = pct >= 85 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)'
        return (
          <div key={name} style={{
            background: 'var(--bg-surface-2)',
            border: `1px solid var(--border)`,
            borderLeft: `3px solid ${color}`,
            borderRadius: 'var(--radius)',
            padding: '8px 12px',
            minWidth: 140,
            flex: '1 1 140px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>{name}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem', color }}>
                {pct}%
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>fit</span>
            </div>
            <div style={{ height: 4, background: 'var(--bg-surface-3)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: barColor,
                borderRadius: 999,
                transition: 'width 0.3s ease',
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
  const [config,        setConfig]      = useState(null)
  const [sizes,         setSizes]       = useState([1_000, 5_000, 10_000, 20_000, 50_000])
  const [algorithms,    setAlgorithms]  = useState(['Brute Force', 'Divide & Conquer', "Kadane's Algorithm"])
  const [distribution,  setDist]        = useState('random')
  const [jobId,         setJobId]       = useState(null)
  const [launching,     setLaunching]   = useState(false)
  const [launchError,   setLaunchError] = useState(null)

  const { job, error: pollError } = useSweepPoller(jobId, 1500)

  // Load config on mount
  useEffect(() => {
    getSweepConfig()
      .then(setConfig)
      .catch(() => {})
  }, [])

  // Notify parent when sweep completes
  useEffect(() => {
    if (job?.status === 'completed' && job.analyses) {
      onSweepComplete?.(job.analyses)
    }
  }, [job?.status, job?.analyses, onSweepComplete])

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
    if (sizes.length === 0 || algorithms.length === 0 || launching) return
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
      setLaunchError(err.response?.data?.detail ?? err.message ?? 'Failed to launch sweep.')
    } finally {
      setLaunching(false)
    }
  }

  const isRunning = job?.status === 'running' || job?.status === 'queued' || launching
  const isDone    = job?.status === 'completed'
  const hasBFSizeOverLimit = sizes.some((s) => s > BF_MAX) && algorithms.includes('Brute Force')

  const allSizes = config?.recommended_sizes ?? [1_000, 5_000, 10_000, 20_000, 50_000, 100_000]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Config Area ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Size Selection */}
        <div>
          <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>
            Dataset Sizes to Benchmark
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {allSizes.map((sz) => (
              <SizeToggle key={sz} size={sz} selected={sizes.includes(sz)} onToggle={toggleSize} />
            ))}
          </div>
          {hasBFSizeOverLimit && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--warning)' }}>
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
              <span>Brute Force will be skipped for N &gt; {BF_MAX.toLocaleString()} (O(N²) quadratic safety limit).</span>
            </div>
          )}
        </div>

        {/* Algorithms */}
        <div>
          <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>
            Included Algorithms
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(config?.algorithms ?? ['Brute Force', 'Divide & Conquer', "Kadane's Algorithm"]).map((algo) => {
              const selected = algorithms.includes(algo)
              const color = ALGO_COLORS[algo] ?? 'var(--accent)'
              return (
                <button
                  key={algo}
                  type="button"
                  onClick={() => toggleAlgo(algo)}
                  aria-pressed={selected}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${selected ? color : 'var(--card-border)'}`,
                    background: 'var(--surface)',
                    boxShadow: selected ? 'var(--shadow-inset)' : 'var(--shadow-raised-sm)',
                    color: selected ? color : 'var(--text-secondary)',
                    fontSize: '0.8125rem',
                    fontWeight: selected ? 700 : 500,
                    cursor: 'pointer',
                    minHeight: 44,
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {algo}
                </button>
              )
            })}
          </div>
        </div>

        {/* Distribution Selection */}
        <div className="form-group">
          <label htmlFor="sweep-distribution-select" className="form-label">Price Distribution Pattern</label>
          <select
            id="sweep-distribution-select"
            className="form-select"
            value={distribution}
            onChange={(e) => setDist(e.target.value)}
            style={{ maxWidth: 280 }}
          >
            {Object.entries(DISTRIBUTION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {launchError && (
          <div className="panel panel-danger" style={{ fontSize: '0.8125rem' }}>{launchError}</div>
        )}
        {pollError && (
          <div className="panel panel-danger" style={{ fontSize: '0.8125rem' }}>{pollError}</div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleLaunch}
          disabled={isRunning || sizes.length === 0 || algorithms.length === 0}
          style={{ alignSelf: 'flex-start', gap: 8 }}
        >
          {launching ? <Spinner size={15} /> : <Zap size={15} />}
          {isRunning ? 'Sweep In Progress…' : isDone ? 'Re-run Complexity Sweep' : 'Run Complexity Sweep'}
        </button>
      </div>

      {/* ── Progress Area ── */}
      {job && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {/* Progress bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                {job.current_description || `${job.status}…`}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 700,
                color: isDone ? 'var(--success)' : 'var(--primary-light)'
              }}>
                {job.progress_pct}%
              </div>
            </div>
            <div className="progress-bar" style={{ height: 6 }}>
              <div className="progress-fill" style={{
                width: `${job.progress_pct}%`,
                background: isDone ? 'var(--success)' : 'var(--primary)',
              }} />
            </div>
            <div style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {job.completed_steps} / {job.total_steps} benchmark steps completed
              {job.status === 'completed' && (
                <span style={{ color: 'var(--success)', marginLeft: 8, fontWeight: 600 }}>✓ Complete</span>
              )}
            </div>
          </div>

          {/* Step Matrix */}
          <StepMatrix
            steps={job.steps}
            algorithms={job.algorithms}
            sizes={job.sizes}
          />

          {/* Fitness Chips */}
          {Object.keys(job.analyses ?? {}).length > 0 && (
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Empirical Curve Fitness
              </div>
              <FitnessChips analyses={job.analyses} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
