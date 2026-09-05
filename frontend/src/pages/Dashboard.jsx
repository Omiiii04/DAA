import { useEffect, useState } from 'react'
import { Database, Zap, Clock, Activity, AlertCircle } from 'lucide-react'
import { getDashboardSummary, getDashboardComparison } from '../api/dashboard'
import AlgorithmTimingChart from '../components/charts/AlgorithmTimingChart'
import Spinner from '../components/common/Spinner'
import { ComplexityBadge } from '../components/common/Badge'
import { useNavigate } from 'react-router-dom'

const ALGO_COLORS = {
  'Brute Force':        'var(--algo-bf)',
  'Divide & Conquer':   'var(--algo-dc)',
  "Kadane's Algorithm": 'var(--algo-kadane)',
}

function MetricCard({ icon: Icon, label, value, sub, color = 'var(--accent)' }) {
  return (
    <div
      className="card"
      style={{
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 'var(--radius-sm)',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-inset)',
        border: '1px solid var(--input-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={20} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: '1.625rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1.15, marginTop: 2 }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  )
}

function AlgorithmCard({ name, stats }) {
  const color = ALGO_COLORS[name] ?? 'var(--accent)'
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--card-border)',
        borderLeft: `4px solid ${color}`,
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow-raised-sm)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>{name}</span>
        <ComplexityBadge complexity={stats.complexity} />
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>Mean Time</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.05rem', color }}>
            {stats.avg_mean_time_ms < 1
              ? `${(stats.avg_mean_time_ms * 1000).toFixed(1)} µs`
              : `${stats.avg_mean_time_ms.toFixed(2)} ms`}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>Runs Sampled</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>

      {/* ── Header ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span className="badge badge-primary">DAA Project</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>FastAPI + React 18</span>
        </div>
        <h2 style={{ marginBottom: 6 }}>Stock Peak Analyzer</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 740, fontSize: '0.875rem', margin: 0 }}>
          Algorithmic analysis and statistical benchmarking of maximum subarray paradigms (Brute Force O(N²), Divide &amp; Conquer O(N log N), and Kadane's Algorithm O(N)) on real and synthetic financial price series.
        </p>
      </div>

      {/* ── Metric Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 16,
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
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

        {/* Timing Chart Card */}
        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ margin: 0 }}>Execution Timing Comparison</h4>
              <p style={{ margin: '3px 0 0', fontSize: '0.8125rem' }}>Mean execution time (ms) per benchmarked dataset</p>
            </div>
          </div>
          <div style={{ padding: '20px' }}>
            <AlgorithmTimingChart comparisonData={comparison?.comparison_data ?? []} height={280} />
          </div>
        </div>

        {/* Algorithm Performance Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h4 style={{ margin: 0 }}>Algorithm Performance</h4>

          {summary?.algorithm_stats && Object.keys(summary.algorithm_stats).length > 0 ? (
            Object.entries(summary.algorithm_stats).map(([name, stats]) => (
              <AlgorithmCard key={name} name={name} stats={stats} />
            ))
          ) : (
            <div className="panel" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem', padding: '26px 16px' }}>
              <div style={{ fontSize: '1.75rem', marginBottom: 8 }}>⏱️</div>
              No benchmark runs recorded yet.<br />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 12 }}
                onClick={() => navigate('/benchmark')}
              >
                Run First Benchmark →
              </button>
            </div>
          )}

          {/* Speedup Summary Card */}
          {(speedupDC || speedupKadane) && (
            <div className="panel panel-success" style={{ marginTop: 2 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>
                ⚡ Observed Speedups vs Brute Force
              </div>
              {speedupDC && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Divide &amp; Conquer</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--algo-dc)' }}>{speedupDC}×</span>
                </div>
              )}
              {speedupKadane && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Kadane's Algorithm</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--algo-kadane)' }}>{speedupKadane}×</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Datasets ── */}
      {summary?.latest_datasets?.length > 0 && (
        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h4 style={{ margin: 0 }}>Recent Datasets</h4>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem' }}>Latest generated and uploaded series</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
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
                        className="btn btn-secondary btn-sm"
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
          padding: '56px 24px',
          background: 'var(--surface)',
          border: '1px dashed var(--divider-strong)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-inset)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📈</div>
          <h3 style={{ marginBottom: 6 }}>No Datasets Stored Yet</h3>
          <p style={{ maxWidth: 440, margin: '0 auto 20px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Generate synthetic Geometric Brownian Motion price series or upload real market CSV/XLSX data to begin analysis.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => navigate('/datasets')}
          >
            Create First Dataset →
          </button>
        </div>
      )}
    </div>
  )
}
