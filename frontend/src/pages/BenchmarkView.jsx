import { useState, useEffect } from 'react'
import { Timer, Play, AlertCircle, CheckCircle } from 'lucide-react'
import { listDatasets } from '../api/datasets'
import { startBenchmark } from '../api/benchmark'
import { useBenchmarkPoller } from '../hooks/useBenchmarkPoller'
import AlgorithmTimingChart from '../components/charts/AlgorithmTimingChart'
import Spinner from '../components/common/Spinner'
import { ComplexityBadge } from '../components/common/Badge'

const ALGO_COLORS = {
  'Brute Force':        'var(--algo-bf)',
  'Divide & Conquer':   'var(--algo-dc)',
  "Kadane's Algorithm": 'var(--algo-kadane)',
}

// ── Dataset Selector ───────────────────────────────────────────────────────────
function DatasetSelector({ value, onChange }) {
  const [datasets, setDatasets] = useState([])
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    listDatasets(1, 100)
      .then((d) => setDatasets(d.items ?? []))
      .catch((err) => setLoadError(err.message))
  }, [])

  if (loadError) {
    return <div style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>Failed to load datasets</div>
  }

  return (
    <select
      id="benchmark-dataset-select"
      className="form-select"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">— Select a dataset to benchmark —</option>
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
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {statusSteps.map((s, i) => {
          const isPassed = i < stepIdx || job.status === 'completed'
          const isCurrent = i === stepIdx
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isPassed ? 'var(--success)' : isCurrent ? 'var(--accent)' : 'var(--surface)',
                boxShadow: isPassed || isCurrent ? 'var(--shadow-raised-sm)' : 'var(--shadow-inset)',
                border: isPassed || isCurrent ? 'none' : '1px solid var(--input-border)',
                fontSize: '0.75rem', fontWeight: 700,
                color: isPassed ? '#FFFFFF' : isCurrent ? 'var(--accent-ink)' : 'var(--text-muted)',
              }}>
                {isPassed ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: '0.8125rem', fontWeight: isCurrent || isPassed ? 700 : 500,
                color: isCurrent ? 'var(--accent)' : isPassed ? 'var(--success)' : 'var(--text-muted)',
                textTransform: 'capitalize',
              }}>{s}</span>
              {i < statusSteps.length - 1 && (
                <div style={{
                  width: 24, height: 2,
                  background: i < stepIdx ? 'var(--success)' : 'var(--divider)',
                }} />
              )}
            </div>
          )
        })}
        {job.status === 'failed' && (
          <span className="badge badge-danger" style={{ marginLeft: 8 }}>Failed</span>
        )}
      </div>

      {/* Animated running indicator */}
      {job.status === 'running' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Spinner size={18} />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {job.progress_message ?? 'Running 10-iteration statistical benchmark…'}
          </span>
        </div>
      )}

      {/* Timing & Job details */}
      {job.created_at && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>Job ID: <code style={{ color: 'var(--text-secondary)' }}>{job.job_id?.slice(0, 12)}…</code></span>
          <span>N = <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>{job.dataset_size?.toLocaleString()}</span></span>
          {job.cached && <span className="badge badge-info">Cache Hit</span>}
        </div>
      )}

      {job.error && (
        <div className="panel panel-danger" style={{ fontSize: '0.8125rem' }}>
          <AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />
          {job.error}
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
            <th>Std Dev (ms)</th>
            <th>Mean Delta RAM (MB)</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(report.stats).map(([name, s]) => {
            const color = ALGO_COLORS[name] ?? 'var(--accent)'
            const toMs = (v) => typeof v === 'number' ? (v * 1000).toFixed(4) : '—'
            return (
              <tr key={name}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span className="td-primary">{name}</span>
                  </div>
                </td>
                <td><ComplexityBadge complexity={s.time_complexity} /></td>
                <td className="td-mono">{toMs(s.mean_time)}</td>
                <td className="td-mono">{toMs(s.median_time)}</td>
                <td className="td-mono">{toMs(s.min_time)}</td>
                <td className="td-mono">{toMs(s.max_time)}</td>
                <td className="td-mono">{toMs(s.std_time)}</td>
                <td className="td-mono">{typeof s.mean_memory_mb === 'number' ? s.mean_memory_mb.toFixed(3) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Speedup Summary ───────────────────────────────────────────────────────────
function SpeedupSummary({ report }) {
  if (!report?.stats) return null
  const bf  = report.stats['Brute Force']?.mean_time
  const dc  = report.stats['Divide & Conquer']?.mean_time
  const kad = report.stats["Kadane's Algorithm"]?.mean_time
  if (!bf) return null

  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
      {dc && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--card-border)',
          borderLeft: '4px solid var(--algo-dc)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-raised-sm)',
          padding: '12px 16px',
          flex: '1 1 200px',
        }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>
            D&C Speedup vs BF
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.35rem', color: 'var(--algo-dc)', marginTop: 2 }}>
            {(bf / dc).toFixed(1)}× faster
          </div>
        </div>
      )}
      {kad && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--card-border)',
          borderLeft: '4px solid var(--algo-kadane)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-raised-sm)',
          padding: '12px 16px',
          flex: '1 1 200px',
        }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>
            Kadane Speedup vs BF
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.35rem', color: 'var(--algo-kadane)', marginTop: 2 }}>
            {(bf / kad).toFixed(1)}× faster
          </div>
        </div>
      )}
      {dc && kad && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--card-border)',
          borderLeft: '4px solid var(--info)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-raised-sm)',
          padding: '12px 16px',
          flex: '1 1 200px',
        }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>
            Kadane vs D&C
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.35rem', color: 'var(--info)', marginTop: 2 }}>
            {(dc / kad).toFixed(1)}× faster
          </div>
        </div>
      )}
    </div>
  )
}

function buildComparisonData(report, datasetName) {
  if (!report?.stats) return []
  const row = { dataset_name: datasetName || 'Current Dataset', dataset_size: report.dataset_size }
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

  useEffect(() => {
    if (!datasetId) { setDatasetName(''); return }
    listDatasets(1, 100)
      .then((d) => {
        const ds = d.items?.find((x) => x.id === datasetId)
        if (ds) setDatasetName(ds.name)
      })
      .catch(() => {})
  }, [datasetId])

  const handleLaunch = async () => {
    if (!datasetId || launching) return
    setLaunching(true)
    setError(null)
    setJobId(null)
    try {
      const data = await startBenchmark(datasetId)
      setJobId(data.job_id)
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to initiate benchmark.')
    } finally {
      setLaunching(false)
    }
  }

  const comparisonData = buildComparisonData(report, datasetName)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header Info */}
      <div>
        <h2 style={{ marginBottom: 4 }}>Benchmark Suite</h2>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>
          Execute 10-iteration statistical profiling (Mean, Median, Min, Max, Std Dev) on execution time and memory delta.
        </p>
      </div>

      {/* ── Control Row ── */}
      <div className="card">
        <div style={{ padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 280px' }}>
            <label htmlFor="benchmark-dataset-select" className="form-label">Select Dataset for Benchmarking</label>
            <DatasetSelector value={datasetId} onChange={setDatasetId} />
          </div>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleLaunch}
            disabled={!datasetId || launching || (job?.status === 'running' || job?.status === 'queued')}
          >
            {launching ? <Spinner size={16} /> : <Play size={16} />}
            {launching ? 'Queuing benchmark…' : 'Run Benchmark'}
          </button>
        </div>

        <div style={{ padding: '0 20px 16px' }}>
          <div className="panel panel-info" style={{ fontSize: '0.8125rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Timer size={15} color="var(--info)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              Each benchmark measures <strong>10 independent iterations</strong> per algorithm in a dedicated thread with garbage collection flushing between runs.
              <strong style={{ color: 'var(--warning)', marginLeft: 4 }}>
                Brute Force is safely skipped for N &gt; 20,000 to prevent long browser timeouts.
              </strong>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="panel panel-danger">{error}</div>}
      {pollError && <div className="panel panel-danger">{pollError}</div>}

      {/* Progress */}
      {job && <PollingProgress job={job} />}

      {/* Results */}
      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Verification Banner */}
          <div className={`panel ${report.verification_passed ? 'panel-success' : 'panel-warning'}`}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            {report.verification_passed
              ? <CheckCircle size={16} color="var(--success)" style={{ flexShrink: 0, marginTop: 1 }} />
              : <AlertCircle size={16} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />}
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: 2 }}>
                {report.verification_passed ? 'Cross-Algorithm Consistency Verified ✓' : 'Verification Warning: Discrepancy Found'}
              </div>
              {(report.verification_notes ?? []).map((n, i) => (
                <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{n}</div>
              ))}
            </div>
          </div>

          {/* Bar Chart */}
          <div className="card">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h4 style={{ margin: 0 }}>Execution Timing Comparison — {datasetName}</h4>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem' }}>
                Mean elapsed runtime over {report.iterations} runs · Dataset N = {report.dataset_size?.toLocaleString()}
              </p>
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              <AlgorithmTimingChart comparisonData={comparisonData} height={280} />
              <SpeedupSummary report={report} />
            </div>
          </div>

          {/* Stats Table */}
          <div className="card">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h4 style={{ margin: 0 }}>Detailed Statistical Profile</h4>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem' }}>
                Statistical metrics across {report.iterations} iterations (milliseconds)
              </p>
            </div>
            <div style={{ padding: '8px 0' }}>
              <StatsTable report={report} />
            </div>
          </div>

          {/* Academic Complexity Analysis */}
          <div className="card">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h4 style={{ margin: 0 }}>Theoretical Big-O Context</h4>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(report.stats).map(([name, s]) => {
                const bf = report.stats['Brute Force']?.mean_time
                const speedup = (bf && s.mean_time && name !== 'Brute Force') ? (bf / s.mean_time).toFixed(1) : null
                return (
                  <div key={name} style={{
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${ALGO_COLORS[name] ?? 'var(--primary)'}`,
                    borderRadius: 'var(--radius)',
                    padding: '12px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{name}</span>
                      <ComplexityBadge complexity={s.time_complexity} />
                      {speedup && (
                        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem', color: 'var(--success)' }}>
                          {speedup}× faster than Brute Force
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.55 }}>
                      {name === 'Brute Force' && (
                        <>Iterates through all N(N−1)/2 ≈ <code style={{ fontFamily: 'var(--font-mono)' }}>
                          {Math.round(report.dataset_size * (report.dataset_size - 1) / 2).toLocaleString()}
                        </code> pairs. Quadratic growth — serves as the baseline reference for speedup calculation.</>
                      )}
                      {name === 'Divide & Conquer' && (
                        <>Recursively partitions array into halves; merges via crossing maximum subarray.
                          Recurrence: T(n) = 2T(n/2) + O(n) → O(N log N) by Master Theorem (Case 2).</>
                      )}
                      {name === "Kadane's Algorithm" && (
                        <>Single pass linear scan using dynamic programming state dp[i] = max(price[i], dp[i−1] + price[i]).
                          Optimal O(N) complexity — mathematically provable lower bound for maximum subarray.</>
                      )}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!job && !error && (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: 'var(--bg-surface)', border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>⏱️</div>
          <h3 style={{ marginBottom: 4 }}>Ready to Benchmark</h3>
          <p style={{ maxWidth: 440, margin: '0 auto', fontSize: '0.875rem' }}>
            Choose a dataset above and click <strong>Run Benchmark</strong> to execute statistical iterations and review performance comparisons.
          </p>
        </div>
      )}
    </div>
  )
}
