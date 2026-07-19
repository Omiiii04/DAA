import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Database, GitBranch, Zap, TrendingUp, Clock, Activity } from 'lucide-react'
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

const ALGO_ICONS = {
  'Brute Force':        '🔴',
  'Divide & Conquer':   '🟡',
  "Kadane's Algorithm": '🟢',
}

function MetricCard({ icon: Icon, label, value, sub, color = 'var(--primary)', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="card card-glow"
      style={{ padding: 24, display: 'flex', alignItems: 'flex-start', gap: 16 }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={20} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: '1.875rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1.1 }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
      </div>
    </motion.div>
  )
}

function AlgorithmCard({ name, stats, delay }) {
  const color = ALGO_COLORS[name] ?? '#94a3b8'
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      style={{
        background: 'var(--bg-surface-2)',
        border: `1px solid ${color}20`,
        borderRadius: 'var(--radius-lg)',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '1rem' }}>{ALGO_ICONS[name] ?? '⚪'}</span>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{name}</span>
        <ComplexityBadge complexity={stats.complexity} />
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        <div>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 2 }}>Avg Time</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem', color }}>
            {stats.avg_mean_time_ms < 1
              ? `${(stats.avg_mean_time_ms * 1000).toFixed(1)} µs`
              : `${stats.avg_mean_time_ms.toFixed(2)} ms`}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 2 }}>Benchmarks</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
            {stats.run_count}
          </div>
        </div>
      </div>
      {/* Mini speed bar */}
      <div className="progress-bar">
        <div className="progress-fill" style={{
          width: `${Math.min(100, Math.max(5, stats.avg_mean_time_ms / 5))}%`,
          background: `linear-gradient(90deg, ${color}, ${color}88)`,
          boxShadow: `0 0 8px ${color}60`,
        }} />
      </div>
    </motion.div>
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
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner center label="Loading dashboard…" />
  if (error)   return (
    <div className="panel panel-danger" style={{ marginTop: 40, textAlign: 'center' }}>
      <strong style={{ color: 'var(--danger)' }}>⚠ API Error</strong>
      <p style={{ marginTop: 4 }}>{error}</p>
      <p style={{ marginTop: 4, fontSize: '0.8125rem' }}>Make sure the FastAPI backend is running on port 8000.</p>
    </div>
  )

  const speedupKadane = summary?.speedup_kadane_vs_bf
  const speedupDC     = summary?.speedup_dc_vs_bf

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{
              background: 'var(--primary-dim)',
              color: 'var(--primary-light)',
              padding: '3px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: '1px solid var(--border-active)',
            }}>DAA Academic Project</span>
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: 4 }}>
            Welcome to <span className="gradient-text">Stock Peak Analyzer</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 600, fontSize: '0.9375rem' }}>
            Visualize and benchmark maximum subarray algorithms (Brute Force, Divide & Conquer, Kadane's)
            on synthetic and real stock market datasets.
          </p>
        </motion.div>
      </div>

      {/* ── Metric Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 16,
        marginBottom: 32,
      }}>
        <MetricCard icon={Database}   label="Datasets"          value={summary?.total_datasets ?? 0}         sub="Price series in DB"         color="var(--primary)" delay={0} />
        <MetricCard icon={Activity}   label="Analysis Runs"     value={summary?.total_analysis_runs ?? 0}    sub="Algorithm executions"       color="var(--info)"    delay={0.08} />
        <MetricCard icon={Clock}      label="Benchmark Jobs"    value={summary?.total_benchmark_results ?? 0} sub="10-iteration samples"      color="var(--warning)" delay={0.16} />
        <MetricCard
          icon={Zap}
          label="Best Speedup"
          value={speedupKadane ? `${speedupKadane}×` : '—'}
          sub={speedupKadane ? "Kadane vs Brute Force" : "Run a benchmark first"}
          color="var(--success)"
          delay={0.24}
        />
      </div>

      {/* ── Body Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 24 }}>
        {/* Timing Chart */}
        <motion.div
          className="card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ marginBottom: 2 }}>Algorithm Timing Comparison</h4>
              <p style={{ margin: 0, fontSize: '0.8125rem' }}>Mean execution time (ms) per benchmarked dataset</p>
            </div>
          </div>
          <div style={{ padding: '20px 24px 24px' }}>
            <AlgorithmTimingChart comparisonData={comparison?.comparison_data ?? []} height={280} />
          </div>
        </motion.div>

        {/* Algorithm Performance Panel */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.28 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h4>Algorithm Performance</h4>
          </div>
          {summary?.algorithm_stats && Object.keys(summary.algorithm_stats).length > 0
            ? Object.entries(summary.algorithm_stats).map(([name, stats], i) => (
                <AlgorithmCard key={name} name={name} stats={stats} delay={0.3 + i * 0.08} />
              ))
            : (
              <div className="panel" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', padding: 28 }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>⏱️</div>
                No benchmark data yet.<br />
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => navigate('/benchmark')}>
                  Run First Benchmark →
                </button>
              </div>
            )
          }

          {/* Speedup Summary */}
          {(speedupDC || speedupKadane) && (
            <div className="panel panel-success" style={{ marginTop: 4 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--success)', marginBottom: 8 }}>
                ⚡ Average Speedups vs Brute Force
              </div>
              {speedupDC && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Divide & Conquer</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fcd34d' }}>{speedupDC}×</span>
                </div>
              )}
              {speedupKadane && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Kadane's Algorithm</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--success)' }}>{speedupKadane}×</span>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Recent Datasets ── */}
      {summary?.latest_datasets?.length > 0 && (
        <motion.div
          className="card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div style={{ padding: '18px 24px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4>Recent Datasets</h4>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/datasets')}>View All →</button>
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {summary.latest_datasets.map((ds) => (
                  <tr key={ds.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/analyze?dataset_id=${ds.id}`)}>
                    <td className="td-primary">{ds.name}</td>
                    <td className="td-mono">{ds.size.toLocaleString()}</td>
                    <td><span className="badge badge-info">{ds.distribution_type ?? 'uploaded'}</span></td>
                    <td className="td-mono" style={{ color: 'var(--text-muted)' }}>
                      ${ds.min_price?.toFixed(2)} – ${ds.max_price?.toFixed(2)}
                    </td>
                    <td>
                      {ds.is_verified
                        ? <span className="badge badge-success">✓</span>
                        : <span className="badge badge-muted">–</span>}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                      {new Date(ds.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/analyze?dataset_id=${ds.id}`) }}>
                        Analyze
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* ── Empty State ── */}
      {!summary?.total_datasets && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          style={{
            textAlign: 'center',
            padding: '60px 40px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            marginTop: 16,
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>📈</div>
          <h3 style={{ marginBottom: 8 }}>No datasets yet</h3>
          <p style={{ maxWidth: 380, margin: '0 auto 24px', fontSize: '0.9375rem' }}>
            Generate a synthetic dataset or upload your own CSV/XLSX to get started with algorithm analysis.
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/datasets')}>
            Create First Dataset →
          </button>
        </motion.div>
      )}
    </div>
  )
}
