import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Timer, Play, AlertCircle, CheckCircle, Clock, Cpu, TrendingDown } from 'lucide-react'
import { listDatasets } from '../api/datasets'
import { startBenchmark } from '../api/benchmark'
import { useBenchmarkPoller } from '../hooks/useBenchmarkPoller'
import AlgorithmTimingChart from '../components/charts/AlgorithmTimingChart'
import Spinner from '../components/common/Spinner'
import { ComplexityBadge, StatusBadge } from '../components/common/Badge'

const ALGO_COLORS = {
  'Brute Force':        '#ef4444',
  'Divide & Conquer':   '#f59e0b',
  "Kadane's Algorithm": '#10b981',
}

// ── Dataset Selector ───────────────────────────────────────────────────────────
function DatasetSelector({ value, onChange }) {
  const [datasets, setDatasets] = useState([])
  useEffect(() => {
    listDatasets(1, 100).then((d) => setDatasets(d.items ?? []))
  }, [])
  return (
    <select className="form-select" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">— Select a dataset —</option>
      {datasets.map((ds) => (
        <option key={ds.id} value={ds.id}>
          #{ds.id} {ds.name} (N={ds.size?.toLocaleString()})
        </option>
      ))}
    </select>
  )
}

// ── Polling Progress ──────────────────────────────────────────────────────────
function PollingProgress({ job }) {
  if (!job) return null
  const statusSteps = ['queued', 'running', 'completed']
  const stepIdx = statusSteps.indexOf(job.status)

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {statusSteps.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: i <= stepIdx ? (s === 'completed' ? 'var(--success-dim)' : 'var(--primary-dim)') : 'var(--bg-surface-3)',
              border: `2px solid ${i <= stepIdx ? (s === 'completed' ? 'var(--success)' : 'var(--primary)') : 'var(--border)'}`,
              fontSize: '0.65rem', fontWeight: 700,
              color: i <= stepIdx ? (s === 'completed' ? 'var(--success)' : 'var(--primary)') : 'var(--text-muted)',
              transition: 'all 0.3s ease',
            }}>
              {i < stepIdx || job.status === 'completed' ? '✓' : i + 1}
            </div>
            <span style={{
              fontSize: '0.75rem', fontWeight: 600,
              color: i <= stepIdx ? 'var(--text-primary)' : 'var(--text-muted)',
              textTransform: 'capitalize',
            }}>{s}</span>
            {i < statusSteps.length - 1 && (
              <div style={{
                width: 24, height: 2,
                background: i < stepIdx ? 'var(--primary)' : 'var(--border)',
                transition: 'all 0.3s ease',
              }} />
            )}
          </div>
        ))}
        {job.status === 'failed' && (
          <span className="badge badge-danger" style={{ marginLeft: 8 }}>Failed</span>
        )}
      </div>

      {/* Animated running indicator */}
      {job.status === 'running' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Spinner size={16} />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            {job.progress_message ?? 'Running 10-iteration benchmark…'}
          </span>
        </div>
      )}

      {/* Timing */}
      {job.created_at && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 20 }}>
          <span>Job: <code style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{job.job_id?.slice(0, 13)}…</code></span>
          <span>N = <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{job.dataset_size?.toLocaleString()}</span></span>
          {job.cached && <span className="badge badge-info">Cached</span>}
        </div>
      )}

      {job.error && (
        <div className="panel panel-danger" style={{ fontSize: '0.8125rem' }}>
          <AlertCircle size={13} style={{ display: 'inline', marginRight: 6 }} />{job.error}
        </div>
      )}
    </div>
  )
}

// ── Stats Table ───────────────────────────────────────────────────────────────
function StatsTable({ report }) {
  if (!report?.stats) return null

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Algorithm</th>
            <th>Complexity</th>
            <th>Mean (ms)</th>
            <th>Median (ms)</th>
            <th>Min (ms)</th>
            <th>Max (ms)</th>
            <th>Std (ms)</th>
            <th>Avg Mem (MB)</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(report.stats).map(([name, s]) => {
            const color = ALGO_COLORS[name] ?? '#94a3b8'
            const toMs = (v) => v != null ? (v * 1000).toFixed(4) : '—'
            return (
              <tr key={name}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}80` }} />
                    <span className="td-primary">{name}</span>
                  </div>
                </td>
                <td><ComplexityBadge complexity={s.time_complexity} /></td>
                <td className="td-mono">{toMs(s.mean_time)}</td>
                <td className="td-mono">{toMs(s.median_time)}</td>
                <td className="td-mono">{toMs(s.min_time)}</td>
                <td className="td-mono">{toMs(s.max_time)}</td>
                <td className="td-mono">{toMs(s.std_time)}</td>
                <td className="td-mono">{s.mean_memory_mb != null ? s.mean_memory_mb.toFixed(3) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Speedup Chips ─────────────────────────────────────────────────────────────
function SpeedupChips({ report }) {
  if (!report?.stats) return null
  const bf  = report.stats['Brute Force']?.mean_time
  const dc  = report.stats['Divide & Conquer']?.mean_time
  const kad = report.stats["Kadane's Algorithm"]?.mean_time
  if (!bf) return null

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
      {dc && (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 16px' }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>D&C Speedup vs BF</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.5rem', color: '#fcd34d' }}>
            {(bf / dc).toFixed(1)}×
          </div>
        </div>
      )}
      {kad && (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 16px' }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Kadane Speedup vs BF</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--success)' }}>
            {(bf / kad).toFixed(1)}×
          </div>
        </div>
      )}
      {dc && kad && (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 16px' }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Kadane vs D&C</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--info)' }}>
            {(dc / kad).toFixed(1)}×
          </div>
        </div>
      )}
    </div>
  )
}

// ── Comparison chart data builder ─────────────────────────────────────────────
function buildComparisonData(report, datasetName) {
  if (!report?.stats) return []
  const row = { dataset_name: datasetName, dataset_size: report.dataset_size }
  for (const [name, s] of Object.entries(report.stats)) {
    row[name] = { mean_ms: (s.mean_time ?? 0) * 1000 }
  }
  return [row]
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function BenchmarkView() {
  const [datasetId,   setDatasetId]   = useState(null)
  const [datasetName, setDatasetName] = useState('')
  const [jobId,       setJobId]       = useState(null)
  const [error,       setError]       = useState(null)
  const [launching,   setLaunching]   = useState(false)

  const { job, error: pollError } = useBenchmarkPoller(jobId, 2000)
  const report = job?.report

  // Load dataset name for display
  useEffect(() => {
    if (!datasetId) { setDatasetName(''); return }
    listDatasets(1, 100).then((d) => {
      const ds = d.items?.find((x) => x.id === datasetId)
      if (ds) setDatasetName(ds.name)
    })
  }, [datasetId])

  const handleLaunch = async () => {
    if (!datasetId) return
    setLaunching(true); setError(null); setJobId(null)
    try {
      const data = await startBenchmark(datasetId)
      setJobId(data.job_id)
      // If already completed (cache hit), job status is already populated
    } catch (err) { setError(err.message) }
    finally { setLaunching(false) }
  }

  const comparisonData = buildComparisonData(report, datasetName)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Control Row ── */}
      <div className="card">
        <div style={{ padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 260 }}>
            <label className="form-label">Select Dataset to Benchmark</label>
            <DatasetSelector value={datasetId} onChange={setDatasetId} />
          </div>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleLaunch}
            disabled={!datasetId || launching || (job?.status === 'running' || job?.status === 'queued')}
            style={{ height: 42, alignSelf: 'flex-end' }}
          >
            {launching ? <Spinner size={18} /> : <Play size={18} />}
            {launching ? 'Queuing…' : 'Run Benchmark'}
          </button>
        </div>

        {/* Info banner */}
        <div style={{ padding: '0 24px 16px' }}>
          <div className="panel panel-info" style={{ fontSize: '0.8125rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Timer size={14} color="var(--info)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Each benchmark runs <strong>10 iterations</strong> per algorithm, recording
              execution time (µs precision via <code>perf_counter</code>) and peak memory delta.
              Results are cached by SHA-256 hash — identical datasets return instantly.
              <strong style={{ color: 'var(--warning)', marginLeft: 4 }}>
                Brute Force is limited to N ≤ 20,000 for safety.
              </strong>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="panel panel-danger">{error}</div>}
      {pollError && <div className="panel panel-danger">{pollError}</div>}

      {/* ── Progress ── */}
      <AnimatePresence>
        {job && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <PollingProgress job={job} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results ── */}
      <AnimatePresence>
        {report && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
          >
            {/* Verification Banner */}
            <div className={`panel ${report.verification_passed ? 'panel-success' : 'panel-warning'}`}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {report.verification_passed
                ? <CheckCircle size={16} color="var(--success)" style={{ flexShrink: 0 }} />
                : <AlertCircle size={16} color="var(--warning)" style={{ flexShrink: 0 }} />}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: 4 }}>
                  {report.verification_passed ? 'Cross-Verification Passed ✓' : 'Verification Warning'}
                </div>
                {(report.verification_notes ?? []).map((n, i) => (
                  <div key={i} style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{n}</div>
                ))}
              </div>
            </div>

            {/* Bar Chart */}
            <div className="card">
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                <h4>Execution Time Comparison — {datasetName}</h4>
                <p style={{ margin: '2px 0 0', fontSize: '0.8125rem' }}>
                  Mean time over {report.iterations} iterations · N = {report.dataset_size?.toLocaleString()}
                </p>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <AlgorithmTimingChart comparisonData={comparisonData} height={280} />
                <SpeedupChips report={report} />
              </div>
            </div>

            {/* Stats Table */}
            <div className="card">
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                <h4>Detailed Statistics</h4>
                <p style={{ margin: '2px 0 0', fontSize: '0.8125rem' }}>
                  Min / Max / Mean / Std over {report.iterations} iterations (times in ms)
                </p>
              </div>
              <div style={{ padding: '8px 0' }}>
                <StatsTable report={report} />
              </div>
            </div>

            {/* Academic Analysis */}
            <div className="card">
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                <h4>Academic Analysis</h4>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(report.stats).map(([name, s]) => {
                  const bf = report.stats['Brute Force']?.mean_time
                  const speedup = (bf && s.mean_time && name !== 'Brute Force') ? (bf / s.mean_time).toFixed(1) : null
                  return (
                    <div key={name} style={{
                      background: 'var(--bg-surface-2)',
                      border: `1px solid ${ALGO_COLORS[name] ?? 'var(--border)'}20`,
                      borderRadius: 'var(--radius)',
                      padding: '14px 16px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: ALGO_COLORS[name] }} />
                        <span style={{ fontWeight: 700 }}>{name}</span>
                        <ComplexityBadge complexity={s.time_complexity} />
                        {speedup && (
                          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9375rem', color: 'var(--success)' }}>
                            {speedup}× faster than BF
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.6 }}>
                        {name === 'Brute Force' && (
                          <>Checks all N(N−1)/2 ≈ <code style={{ fontFamily: 'var(--font-mono)' }}>
                            {Math.round(report.dataset_size * (report.dataset_size - 1) / 2).toLocaleString()}
                          </code> pairs. Quaratic growth — baseline reference for speedup calculation.</>
                        )}
                        {name === 'Divide & Conquer' && (
                          <>Recursively splits in halves; max-crossing subarray at each merge.
                            T(n) = 2T(n/2) + O(n) → O(N log N) by Master Theorem Case 2.</>
                        )}
                        {name === "Kadane's Algorithm" && (
                          <>Single linear scan; dp[i] = max(price[i], dp[i−1] + price[i]).
                            Optimal O(N) — no improvement possible for this problem.</>
                        )}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!job && !error && (
        <div style={{
          textAlign: 'center', padding: '60px 40px',
          background: 'var(--bg-surface)', border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--radius-xl)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>⏱️</div>
          <h3 style={{ marginBottom: 8 }}>Ready to benchmark</h3>
          <p style={{ maxWidth: 400, margin: '0 auto', fontSize: '0.9375rem' }}>
            Select a dataset above and click <strong>Run Benchmark</strong>.
            Results are returned asynchronously — the page polls every 2 seconds.
          </p>
        </div>
      )}
    </div>
  )
}
