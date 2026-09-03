import { useEffect, useState, useCallback } from 'react'
import { TrendingUp, RefreshCw, Info, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react'
import { getDashboardComplexity } from '../api/dashboard'
import ComplexityChart from '../components/charts/ComplexityChart'
import SweepPanel from '../components/complexity/SweepPanel'
import Spinner from '../components/common/Spinner'

const COMPLEXITY_REF = [
  {
    label:    'O(N)',
    expected: '≈ 2.00×',
    color:    '#10b981',
    algo:     "Kadane's Algorithm",
    proof:    'T(2n) / T(n) = 2n / n = 2',
    note:     'Optimal theoretical lower bound — single linear scan pass',
  },
  {
    label:    'O(N log N)',
    expected: '≈ 2.05–2.15×',
    color:    '#f59e0b',
    algo:     'Divide & Conquer',
    proof:    '2n·log(2n) / n·log(n) → 2 + 2/log₂(n)',
    note:     'T(n) = 2T(n/2) + O(n) — Master Theorem Case 2',
  },
  {
    label:    'O(N²)',
    expected: '≈ 4.00×',
    color:    '#ef4444',
    algo:     'Brute Force',
    proof:    '(2n)² / n² = 4',
    note:     'Quadratic pairs — safety bounded at N ≤ 20,000',
  },
]

export default function ComplexityView() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [sweepOpen,   setSweepOpen]   = useState(false)
  const [analyses,    setAnalyses]    = useState(null)

  // Load existing DB-backed complexity data
  const loadFromDB = useCallback(() => {
    setLoading(true)
    setError(null)
    getDashboardComplexity()
      .then((d) => {
        setData(d)
        if (d?.has_data) setAnalyses(d.analyses)
      })
      .catch((e) => setError(e.response?.data?.detail ?? e.message ?? 'Failed to load complexity data.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(loadFromDB, [loadFromDB])

  // When sweep completes, merge live analyses into chart
  const handleSweepComplete = useCallback((liveAnalyses) => {
    setAnalyses(liveAnalyses)
    getDashboardComplexity().then((d) => {
      setData(d)
    }).catch(() => {})
  }, [])

  const chartAnalyses = analyses ?? (data?.has_data ? data.analyses : {})
  const hasData = Object.keys(chartAnalyses).length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header Info */}
      <div>
        <h2 style={{ marginBottom: 4 }}>Complexity Visualizer</h2>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>
          Evaluate empirical runtime scaling against Big-O theoretical predictions using the doubling method.
        </p>
      </div>

      {/* Top Banner */}
      <div className="panel panel-info" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Info size={16} color="var(--info)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '0.8125rem', lineHeight: 1.6 }}>
          <strong>Empirical Complexity Analysis (Doubling Method):</strong> Solid curves plot observed execution times normalized to the smallest size.
          Dashed curves depict theoretical growth. The <strong>Fitness Score</strong> quantifies alignment quality via Normalized Mean Absolute Error (NMAE)
          over consecutive size doublings.
        </div>
      </div>

      {/* Sweep Panel Accordion */}
      <div className="card">
        <button
          type="button"
          onClick={() => setSweepOpen((o) => !o)}
          aria-expanded={sweepOpen}
          aria-controls="sweep-panel-body"
          id="sweep-panel-toggle"
          style={{
            width: '100%',
            padding: '14px 20px',
            background: 'none',
            border: 'none',
            borderBottom: sweepOpen ? '1px solid var(--border)' : 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left',
            color: 'var(--text-primary)',
          }}
        >
          <FlaskConical size={18} color="var(--primary-light)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Automated Multi-Size Complexity Sweep</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Auto-generate GBM datasets across sizes (1K to 100K) and benchmark all three algorithms concurrently
            </div>
          </div>
          {sweepOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
        </button>

        {sweepOpen && (
          <div id="sweep-panel-body" style={{ padding: '20px' }}>
            <SweepPanel onSweepComplete={handleSweepComplete} />
          </div>
        )}
      </div>

      {/* Log-Log Growth Chart */}
      <div className="card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: 0 }}>Empirical Growth Curves</h4>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem' }}>
              Normalized time vs. dataset size (N) on log-log coordinates
            </p>
          </div>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={loadFromDB}
            title="Refresh database records"
            aria-label="Refresh complexity chart"
          >
            <RefreshCw size={13} />
          </button>
        </div>
        <div style={{ padding: '20px' }}>
          {loading ? (
            <Spinner center label="Loading complexity data…" />
          ) : error ? (
            <div className="panel panel-danger">{error}</div>
          ) : (
            <ComplexityChart analyses={chartAnalyses} height={420} />
          )}
        </div>
      </div>

      {/* No Data Notice */}
      {!loading && !hasData && (
        <div className="panel panel-warning" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <TrendingUp size={16} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2, fontSize: '0.875rem' }}>
              Insufficient Benchmark Data for Curve Fitting
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              Run the <strong>Automated Multi-Size Complexity Sweep</strong> above, or manually benchmark at least 2 datasets of different sizes to plot empirical curves.
            </p>
          </div>
        </div>
      )}

      {/* Theory Reference Grid */}
      <div>
        <h4 style={{ marginBottom: 12 }}>Big-O Theoretical Reference</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {COMPLEXITY_REF.map((item) => (
            <div
              key={item.label}
              style={{
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${item.color}`,
                borderRadius: 'var(--radius)',
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontWeight: 800,
                  fontSize: '1rem', color: item.color,
                }}>{item.label}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>— {item.algo}</span>
              </div>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                  Expected Doubling Growth Ratio
                </span>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontWeight: 700,
                  fontSize: '1.1rem', color: item.color,
                }}>
                  R(2n) {item.expected}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--bg-surface-3)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', marginBottom: 6 }}>
                {item.proof}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {item.note}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fitness Formula Card */}
      <div className="card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <h4 style={{ margin: 0 }}>Mathematical Fitness Metric</h4>
        </div>
        <div style={{ padding: '18px 20px', fontSize: '0.875rem' }}>
          <p style={{ margin: '0 0 10px', color: 'var(--text-secondary)' }}>
            The <strong>Big-O Fitness Score</strong> evaluates how closely the empirical runtime doubling ratios match mathematical theoretical ratios:
          </p>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.8125rem',
            background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 12,
            color: 'var(--primary-light)',
          }}>
            fitness = 1 − NMAE(R_observed, R_theoretical)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {[
              { range: '≥ 90%', label: 'High Alignment',  color: 'var(--success)', desc: 'Empirical data matches theoretical Big-O' },
              { range: '70–89%', label: 'Moderate',       color: 'var(--info)',    desc: 'Minor CPU throttling or cache effects' },
              { range: '< 70%',  label: 'Sub-Optimal',    color: 'var(--warning)', desc: 'Higher noise or small sample size' },
            ].map((item) => (
              <div key={item.range} style={{
                background: 'var(--bg-surface-2)', borderRadius: 'var(--radius)',
                padding: '10px 12px', border: '1px solid var(--border)',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: item.color, fontSize: '0.9rem' }}>
                  {item.range}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.8125rem', margin: '2px 0' }}>{item.label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
