/**
 * ReportView — Phase 5
 *
 * Professional report generation page. Features:
 *   - Live list of reportable datasets with section availability badges
 *   - One-click PDF download with animated loading state
 *   - Report content preview (what will be included)
 *   - Deep links to analyze/benchmark pages for datasets missing data
 */

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Download, RefreshCw, CheckCircle, XCircle,
  BarChart2, TrendingUp, FlaskConical, AlertTriangle, ExternalLink,
  Database, Clock
} from 'lucide-react'
import { listReportableDatasets, downloadReport } from '../api/report'
import Spinner from '../components/common/Spinner'

const SECTION_INFO = [
  {
    key: 'has_analysis',
    icon: CheckCircle,
    color: 'var(--success)',
    label: 'Algorithm Results',
    detail: 'Max profit table, buy/sell indices, D&C sub-problem sums',
  },
  {
    key: 'has_benchmark',
    icon: BarChart2,
    color: 'var(--primary)',
    label: 'Benchmark Stats',
    detail: 'Mean/Median/Min/Max/Std timing, speedup matrix, bar chart',
  },
  {
    key: 'has_complexity',
    icon: TrendingUp,
    color: 'var(--warning)',
    label: 'Complexity Analysis',
    detail: 'Fitness scores, doubling ratios, log-log curve chart',
  },
]

// ── Dataset Card ──────────────────────────────────────────────────────────────
function DatasetCard({ ds, onDownload, downloading }) {
  const sectionCount = SECTION_INFO.filter((s) => ds[s.key]).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        overflow: 'hidden',
        transition: 'box-shadow 0.2s ease',
      }}
    >
      {/* Card header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: 'var(--primary-dim)',
          border: '1px solid var(--border-active)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Database size={18} color="var(--primary-light)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: '0.9375rem',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{ds.name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            ID #{ds.id} · N={ds.size?.toLocaleString()} · {ds.distribution_type ?? 'N/A'} · {ds.source}
          </div>
        </div>
        <div style={{
          background: sectionCount === 3 ? 'var(--success-dim)' : 'var(--primary-dim)',
          border: `1px solid ${sectionCount === 3 ? 'var(--success)' : 'var(--primary)'}40`,
          borderRadius: 999, padding: '3px 10px',
          fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
          color: sectionCount === 3 ? 'var(--success)' : 'var(--primary-light)',
        }}>
          {sectionCount}/3 sections
        </div>
      </div>

      {/* Section badges */}
      <div style={{ padding: '12px 20px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        {SECTION_INFO.map(({ key, icon: Icon, color, label, detail }) => {
          const has = ds[key]
          return (
            <div key={key} title={detail} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px',
              borderRadius: 999,
              background: has ? `${color}12` : 'var(--bg-surface-2)',
              border: `1px solid ${has ? color : 'var(--border)'}40`,
              opacity: has ? 1 : 0.45,
            }}>
              <Icon size={11} color={has ? color : 'var(--text-muted)'} />
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: has ? color : 'var(--text-muted)' }}>
                {label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Price info + actions */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {ds.min_price != null && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Price: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              ${ds.min_price?.toFixed(2)} – ${ds.max_price?.toFixed(2)}
            </span>
          </div>
        )}
        {ds.created_at && (
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} />
            {new Date(ds.created_at).toLocaleDateString()}
          </div>
        )}
        <div style={{ flex: 1 }} />

        {/* Missing data links */}
        {!ds.has_analysis && (
          <Link to="/analyze" style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: '0.75rem', color: 'var(--warning)', textDecoration: 'none',
          }}>
            <ExternalLink size={11} /> Run Analysis
          </Link>
        )}
        {!ds.has_benchmark && (
          <Link to="/benchmark" style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: '0.75rem', color: 'var(--primary-light)', textDecoration: 'none',
          }}>
            <ExternalLink size={11} /> Run Benchmark
          </Link>
        )}

        {/* Download button */}
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onDownload(ds.id, ds.name)}
          disabled={downloading === ds.id}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {downloading === ds.id
            ? <Spinner size={14} />
            : <Download size={14} />
          }
          {downloading === ds.id ? 'Generating…' : 'Download PDF'}
        </button>
      </div>
    </motion.div>
  )
}


// ── Report Content Preview ────────────────────────────────────────────────────
function ReportPreview() {
  const sections = [
    { n: '1', title: 'Cover Page',           desc: 'Dataset metadata, SHA-256 hash, generation timestamp, academic context.' },
    { n: '2', title: 'Price Series Chart',   desc: 'LTTB-downsampled line chart with optimal buy/sell markers.' },
    { n: '3', title: 'Algorithm Results',    desc: 'Max profit, buy/sell indices and prices, hold duration, D&C sub-problem sums.' },
    { n: '4', title: 'Benchmark Statistics', desc: '10-iteration timing statistics (mean/median/min/max/std ms), speedup matrix, bar chart.' },
    { n: '5', title: 'Complexity Analysis',  desc: 'Fitness scores, growth ratios, log-log complexity curves, per-algorithm summaries.' },
    { n: '6', title: 'Academic Conclusions', desc: 'Algorithm ranking, Big-O formal proofs, Kadane optimality proof, recommendations.' },
  ]

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <FileText size={16} color="var(--primary)" />
        <h4 style={{ margin: 0, fontSize: '0.9375rem' }}>Report Contents</h4>
        <span style={{
          marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>PDF · A4 · ReportLab</span>
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sections.map((s) => (
          <div key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              background: 'var(--primary-dim)', border: '1px solid var(--border-active)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary-light)',
            }}>{s.n}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: 2 }}>
                {s.title}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {s.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportView() {
  const [datasets,    setDatasets]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [downloading, setDownloading] = useState(null)
  const [dlError,     setDlError]     = useState(null)
  const [dlSuccess,   setDlSuccess]   = useState(null)

  const loadDatasets = useCallback(() => {
    setLoading(true)
    setError(null)
    listReportableDatasets()
      .then((d) => setDatasets(d.datasets ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(loadDatasets, [loadDatasets])

  const handleDownload = async (datasetId, datasetName) => {
    setDownloading(datasetId)
    setDlError(null)
    setDlSuccess(null)
    try {
      await downloadReport(datasetId)
      setDlSuccess(`Report for "${datasetName}" downloaded successfully.`)
      setTimeout(() => setDlSuccess(null), 5000)
    } catch (e) {
      setDlError(e.response?.data?.detail ?? e.message)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Page header ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>PDF Report Generator</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Download a professional academic PDF report for any analyzed dataset — includes
              price charts, benchmark statistics, complexity analysis, and conclusions.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={loadDatasets} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </motion.div>

      {/* ── Success / Error toasts ── */}
      <AnimatePresence>
        {dlSuccess && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="panel panel-success"
            style={{ display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <CheckCircle size={16} color="var(--success)" />
            {dlSuccess}
          </motion.div>
        )}
        {dlError && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="panel panel-danger"
            style={{ display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <XCircle size={16} color="var(--danger)" />
            {dlError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main layout: datasets list + preview ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

        {/* Left: Dataset list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <h4 style={{ margin: 0 }}>Datasets with Report Data</h4>
            {!loading && (
              <span style={{
                background: 'var(--primary-dim)', border: '1px solid var(--border-active)',
                borderRadius: 999, padding: '2px 8px',
                fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary-light)',
              }}>{datasets.length}</span>
            )}
          </div>

          {loading && <Spinner center label="Loading datasets…" />}
          {error   && <div className="panel panel-danger">{error}</div>}

          {!loading && !error && datasets.length === 0 && (
            <div className="panel panel-warning" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>No Reportable Datasets Yet</div>
                <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.6 }}>
                  To generate a report, first{' '}
                  <Link to="/datasets" style={{ color: 'var(--primary-light)' }}>create or upload a dataset</Link>,
                  then run{' '}
                  <Link to="/analyze" style={{ color: 'var(--primary-light)' }}>analysis</Link> or{' '}
                  <Link to="/benchmark" style={{ color: 'var(--primary-light)' }}>benchmarks</Link>.
                  The more data you add, the richer the report.
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {datasets.map((ds) => (
              <DatasetCard
                key={ds.id}
                ds={ds}
                onDownload={handleDownload}
                downloading={downloading}
              />
            ))}
          </div>
        </div>

        {/* Right: Preview panel (sticky) */}
        <div style={{ position: 'sticky', top: 24 }}>
          <ReportPreview />

          {/* Report tech badge */}
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'var(--bg-surface-2)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em' }}>Report Tech Stack</div>
            {[
              ['Engine',    'ReportLab Platypus'],
              ['Charts',    'ReportLab Graphics (inline)'],
              ['Format',    'A4 · Portrait · PDF/1.4'],
              ['Algorithm', 'LTTB for price downsampling'],
              ['Analysis',  'Normalized MAE fitness score'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
