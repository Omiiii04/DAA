import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, RefreshCw, Info, FlaskConical } from 'lucide-react'
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
    proof:    'T(2n)/T(n) = 2n/n = 2',
    note:     'Theoretical optimum — single pass, no improvement possible',
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
    note:     'Impractical for N > 20K — use only as reference baseline',
  },
]

export default function ComplexityView() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [sweepOpen,   setSweepOpen]   = useState(false)
  const [analyses,    setAnalyses]    = useState(null)  // live from sweep OR from DB

  // Load existing DB-backed complexity data
  const loadFromDB = useCallback(() => {
    setLoading(true)
    getDashboardComplexity()
      .then((d) => {
        setData(d)
        if (d?.has_data) setAnalyses(d.analyses)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(loadFromDB, [loadFromDB])

  // When sweep completes, merge live analyses into chart
  const handleSweepComplete = useCallback((liveAnalyses) => {
    setAnalyses(liveAnalyses)
    // Also re-fetch from DB so chart reflects persisted results
    getDashboardComplexity().then((d) => {
      setData(d)
    })
  }, [])

  const chartAnalyses = analyses ?? (data?.has_data ? data.analyses : {})
  const hasData = Object.keys(chartAnalyses).length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Top Info Banner ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="panel panel-info"
        style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}
      >
        <Info size={18} color="var(--info)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <h4 style={{ marginBottom: 4, fontSize: '1rem' }}>
            Empirical Complexity Analysis — Doubling Method
          </h4>
          <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.65 }}>
            Both axes use a <strong>log scale</strong>. Solid lines = observed timings (normalized to 1.0 at smallest N);
            dashed = theoretical Big-O curve. The <strong>Fitness Score</strong> quantifies curve alignment using
            Normalized MAE of consecutive doubling ratios. Use <strong>Run Sweep</strong> to auto-generate datasets
            at multiple sizes and populate the chart automatically.
          </p>
        </div>
      </motion.div>

      {/* ── Sweep Panel Accordion ── */}
      <div className="card">
        <button
          onClick={() => setSweepOpen((o) => !o)}
          style={{
            width: '100%',
            padding: '16px 24px',
            background: 'none',
            border: 'none',
            borderBottom: sweepOpen ? '1px solid var(--border)' : 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textAlign: 'left',
            color: 'var(--text-primary)',
          }}
        >
          <FlaskConical size={18} color="var(--primary)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Run Automated Complexity Sweep</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 1 }}>
              Auto-generate GBM datasets at multiple sizes and benchmark all algorithms in one click
            </div>
          </div>
          <span style={{
            fontSize: '0.75rem', color: 'var(--text-muted)',
            transform: sweepOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            display: 'inline-block',
          }}>▼</span>
        </button>
        <AnimatePresence initial={false}>
          {sweepOpen && (
            <motion.div
              key="sweep-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ padding: '20px 24px 24px' }}>
                <SweepPanel onSweepComplete={handleSweepComplete} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Log-Log Chart ── */}
      <div className="card">
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4>Empirical Complexity Curves</h4>
            <p style={{ margin: '2px 0 0', fontSize: '0.8125rem' }}>
              Log-log chart · Normalized growth · Solid = observed · Dashed = theoretical
            </p>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={loadFromDB} title="Refresh from DB">
            <RefreshCw size={14} />
          </button>
        </div>
        <div style={{ padding: '24px' }}>
          {loading
            ? <Spinner center label="Loading complexity data…" />
            : error
              ? <div className="panel panel-danger">{error}</div>
              : <ComplexityChart analyses={chartAnalyses} height={460} />
          }
        </div>
      </div>

      {/* ── No-data warning ── */}
      {!loading && !hasData && (
        <div className="panel panel-warning" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <TrendingUp size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: '0.875rem' }}>
              No benchmark data to visualize yet
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.6 }}>
              Use <strong>Run Automated Complexity Sweep</strong> above, or manually benchmark datasets
              of at least 2 different sizes on the Benchmark page.
              Recommended sizes: <code>1K, 5K, 10K, 20K, 50K, 100K</code>.
            </p>
          </div>
        </div>
      )}

      {/* ── Big-O Theory Reference ── */}
      <div>
        <h4 style={{ marginBottom: 16 }}>Big-O Theory Reference</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {COMPLEXITY_REF.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              style={{
                background: 'var(--bg-surface-2)',
                border: `1px solid ${item.color}25`,
                borderRadius: 'var(--radius-lg)',
                padding: 20,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontWeight: 800,
                  fontSize: '1rem', color: item.color,
                }}>{item.label}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>— {item.algo}</span>
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                  Expected Doubling Ratio
                </span>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontWeight: 800,
                  fontSize: '1.25rem', color: item.color,
                }}>R {item.expected}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', background: `${item.color}08`, padding: '6px 10px', borderRadius: 'var(--radius-sm)', marginBottom: 8 }}>
                {item.proof}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.note}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Fitness Score Explainer ── */}
      <div className="card">
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <h4>Fitness Score — Formal Definition</h4>
        </div>
        <div style={{ padding: '20px 24px', fontSize: '0.9rem', lineHeight: 1.8 }}>
          <p style={{ margin: '0 0 12px' }}>
            The <strong>Fitness Score</strong> is computed as:
          </p>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
            background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16,
            color: 'var(--primary-light)',
          }}>
            fitness = 1 − NMAE(observed_ratios, theoretical_ratios)
          </div>
          <p style={{ margin: '0 0 8px' }}>
            Where the doubling ratio at size index <em>i</em> is:
          </p>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
            background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16,
            color: 'var(--info)',
          }}>
            R[i] = T(sizes[i]) / T(sizes[i-1])
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { range: '90–100%', label: 'Excellent',   color: 'var(--success)', desc: 'Perfect curve alignment' },
              { range: '70–90%',  label: 'Good',        color: 'var(--info)',    desc: 'Minor cache/branch effects' },
              { range: '< 70%',   label: 'Investigate', color: 'var(--warning)', desc: 'Possible misclassification' },
            ].map((item) => (
              <div key={item.range} style={{
                background: 'var(--bg-surface-2)', borderRadius: 'var(--radius)',
                padding: '12px 14px', border: '1px solid var(--border)',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: item.color, marginBottom: 4 }}>
                  {item.range}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
