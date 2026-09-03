import { useEffect, useState } from 'react'
import { Database, GitBranch, Zap, Clock, Activity, AlertCircle } from 'lucide-react'
import { getDashboardSummary, getDashboardComparison } from '../api/dashboard'
import AlgorithmTimingChart from '../components/charts/AlgorithmTimingChart'
import Spinner from '../components/common/Spinner'
import { ComplexityBadge } from '../components/common/Badge'
import { useNavigate } from 'react-router-dom'

const ALGO_COLORS = {
  'Brute Force':        '#ef4444',
  'Divide & Conquer':   '#f59e0b',
  "Kadane's Algorithm": '#10b981',
}

function MetricCard({ icon: Icon, label, value, sub, color = 'var(--primary-light)' }) {
  return (
    <div
      className="card"
      style={{
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 'var(--radius)',
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border-strong)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1.2 }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

function AlgorithmCard({ name, stats }) {
  const color = ALGO_COLORS[name] ?? 'var(--primary)'
  return (
    <div
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 'var(--radius)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{name}</span>
        <ComplexityBadge complexity={stats.complexity} />
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Mean Time</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color }}>
            {stats.avg_mean_time_ms < 1
              ? `${(stats.avg_mean_time_ms * 1000).toFixed(1)} µs`
              : `${stats.avg_mean_time_ms.toFixed(2)} ms`}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Runs Sampled</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>
            {stats.run_count}
          </div>
        </div>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{
          width: `${Math.min(100, Math.max(8, stats.avg_mean_time_ms / 5))}%`,
          background: color,
        }} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [summary, setSummary]       = useState(null)
  const [comparison, setComparison] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([getDashboardSummary(), getDashboardComparison()])
      .then(([s, c]) => { setSummary(s); setComparison(c) })
      .catch((e) => setError(e.response?.data?.detail ?? e.message ?? 'Failed to load dashboard data.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner center label="Loading system dashboard…" />

  if (error) return (
    <div className="panel panel-danger" style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>
        <AlertCircle size={18} />
        <span>Backend Connection Error</span>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: '0.875rem' }}>{error}</p>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
        Verify that the FastAPI backend is running via <code>uvicorn main:app --reload</code> on port 8000.
      </p>
    </div>
  )

  const speedupKadane = summary?.speedup_kadane_vs_bf
  const speedupDC     = summary?.speedup_dc_vs_bf

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span className="badge badge-primary">DAA Project</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>FastAPI + React 18</span>
        </div>
        <h2 style={{ marginBottom: 4 }}>Stock Peak Analyzer</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 720, fontSize: '0.875rem', margin: 0 }}>
          Algorithmic analysis and benchmarking of maximum subarray paradigms (Brute Force O(N²), Divide & Conquer O(N log N), and Kadane's Algorithm O(N)) on real and synthetic price series.
        </p>
      </div>

      {/* ── Metric Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14,
      }}>
        <MetricCard icon={Database} label="Stored Datasets"   value={summary?.total_datasets ?? 0}          sub="Datasets ready in DB" />
        <MetricCard icon={Activity} label="Algorithm Analyses" value={summary?.total_analysis_runs ?? 0}     sub="Total execution runs" color="var(--info)" />
        <MetricCard icon={Clock}    label="Benchmark Samples"  value={summary?.total_benchmark_results ?? 0} sub="10-iteration profiles" color="var(--warning)" />
        <MetricCard
          icon={Zap}
          label="Kadane Speedup"
          value={speedupKadane ? `${speedupKadane}×` : '—'}
          sub={speedupKadane ? "Relative to Brute Force" : "Awaiting benchmark data"}
          color="var(--success)"
        />
      </div>

      {/* ── Body Grid ── */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

        {/* Timing Chart */}
        <div className="card">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ margin: 0 }}>Execution Timing Comparison</h4>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem' }}>Mean execution time (ms) per benchmarked dataset</p>
            </div>
          </div>
          <div style={{ padding: '16px 18px 20px' }}>
            <AlgorithmTimingChart comparisonData={comparison?.comparison_data ?? []} height={280} />
          </div>
        </div>

        {/* Algorithm Performance Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h4 style={{ margin: 0 }}>Algorithm Performance</h4>

          {summary?.algorithm_stats && Object.keys(summary.algorithm_stats).length > 0 ? (
            Object.entries(summary.algorithm_stats).map(([name, stats]) => (
              <AlgorithmCard key={name} name={name} stats={stats} />
            ))
          ) : (
            <div className="panel" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem', padding: '24px 16px' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>⏱️</div>
              No benchmark runs recorded yet.<br />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 10 }}
                onClick={() => navigate('/benchmark')}
              >
                Run First Benchmark →
              </button>
            </div>
          )}

          {/* Speedup Summary Card */}
          {(speedupDC || speedupKadane) && (
            <div className="panel panel-success" style={{ marginTop: 2 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--success)', marginBottom: 6 }}>
                ⚡ Observed Speedups vs Brute Force
              </div>
              {speedupDC && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: 2 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Divide & Conquer</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fcd34d' }}>{speedupDC}×</span>
                </div>
              )}
              {speedupKadane && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Kadane's Algorithm</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--success)' }}>{speedupKadane}×</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Datasets ── */}
      {summary?.latest_datasets?.length > 0 && (
        <div className="card">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>Recent Datasets</h4>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/datasets')}
            >
              View All Datasets →
            </button>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size (N)</th>
                  <th>Distribution</th>
                  <th>Price Range</th>
                  <th>Verified</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {summary.latest_datasets.map((ds) => (
                  <tr key={ds.id}>
                    <td className="td-primary">{ds.name}</td>
                    <td className="td-mono">{ds.size.toLocaleString()}</td>
                    <td>
                      <span className="badge badge-muted">{ds.distribution_type ?? 'uploaded'}</span>
                    </td>
                    <td className="td-mono" style={{ color: 'var(--text-muted)' }}>
                      ${ds.min_price?.toFixed(2)} – ${ds.max_price?.toFixed(2)}
                    </td>
                    <td>
                      {ds.is_verified ? (
                        <span className="badge badge-success">✓ Passed</span>
                      ) : (
                        <span className="badge badge-muted">Unchecked</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                      {ds.created_at ? new Date(ds.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/analyze?dataset_id=${ds.id}`)}
                      >
                        Analyze
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty State ── */}
      {!summary?.total_datasets && (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          background: 'var(--bg-surface)',
          border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📈</div>
          <h3 style={{ marginBottom: 4 }}>No Datasets Stored Yet</h3>
          <p style={{ maxWidth: 420, margin: '0 auto 16px', fontSize: '0.875rem' }}>
            Generate synthetic Geometric Brownian Motion price series or upload real market CSV/XLSX data to begin analysis.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/datasets')}
          >
            Create First Dataset →
          </button>
        </div>
      )}
    </div>
  )
}
