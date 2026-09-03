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
import {
  FileText, Download, RefreshCw, CheckCircle, XCircle,
  BarChart2, TrendingUp, AlertTriangle, ExternalLink,
  Database, Clock, X
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
    color: 'var(--primary-light)',
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
  const isDownloading = downloading === ds.id

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Card Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 'var(--radius)', flexShrink: 0,
          background: 'var(--bg-surface-2)',
          border: '1px solid var(--border-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Database size={16} color="var(--primary-light)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: '0.875rem',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {ds.name}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            ID #{ds.id} · N={ds.size?.toLocaleString()} · {ds.distribution_type ?? 'uploaded'}
          </div>
        </div>
        <div style={{
          background: sectionCount === 3 ? 'var(--success-dim)' : 'var(--bg-surface-2)',
          border: `1px solid ${sectionCount === 3 ? 'var(--success)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)', padding: '2px 8px',
          fontSize: '0.7rem', fontWeight: 600, flexShrink: 0,
          color: sectionCount === 3 ? 'var(--success)' : 'var(--text-secondary)',
        }}>
          {sectionCount} of 3 sections
        </div>
      </div>

      {/* Section badges */}
      <div style={{ padding: '10px 18px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        {SECTION_INFO.map(({ key, icon: Icon, color, label, detail }) => {
          const has = Boolean(ds[key])
          return (
            <div
              key={key}
              title={detail}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 8px',
                borderRadius: 'var(--radius)',
                background: has ? 'var(--bg-surface-2)' : 'transparent',
                border: `1px solid ${has ? 'var(--border-strong)' : 'transparent'}`,
                opacity: has ? 1 : 0.45,
              }}
            >
              <Icon size={12} color={has ? color : 'var(--text-muted)'} />
              <span style={{ fontSize: '0.72rem', fontWeight: 500, color: has ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Price info + actions */}
      <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {ds.min_price != null && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Range: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              ${ds.min_price?.toFixed(2)} – ${ds.max_price?.toFixed(2)}
            </span>
          </div>
        )}
        {ds.created_at && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} />
            {new Date(ds.created_at).toLocaleDateString()}
          </div>
        )}
        <div style={{ flex: 1 }} />

        {/* Missing section deep links */}
        {!ds.has_analysis && (
          <Link
            to={`/analyze?dataset_id=${ds.id}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: '0.75rem', color: 'var(--warning)', textDecoration: 'none',
            }}
          >
            <ExternalLink size={11} /> Analyze
          </Link>
        )}
        {!ds.has_benchmark && (
          <Link
            to="/benchmark"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: '0.75rem', color: 'var(--primary-light)', textDecoration: 'none',
            }}
          >
            <ExternalLink size={11} /> Benchmark
          </Link>
        )}

        {/* Download button */}
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onDownload(ds.id, ds.name)}
          disabled={isDownloading}
          style={{ gap: 6 }}
        >
          {isDownloading ? <Spinner size={13} /> : <Download size={13} />}
          {isDownloading ? 'Building PDF…' : 'Download PDF'}
        </button>
      </div>
    </div>
  )
}

// ── Report Content Preview ────────────────────────────────────────────────────
function ReportPreview() {
  const sections = [
    { n: '1', title: 'Cover Page',           desc: 'Dataset metadata, SHA-256 hash, generation timestamp, academic DAA context.' },
    { n: '2', title: 'Price Series Chart',   desc: 'LTTB-downsampled high-resolution chart with buy/sell execution markers.' },
    { n: '3', title: 'Algorithm Results',    desc: 'Max profit, optimal buy/sell index coordinates, hold duration, D&C merge sums.' },
    { n: '4', title: 'Benchmark Statistics', desc: '10-iteration stats (Mean, Median, Min, Max, Std Dev), memory deltas, speedup ratios.' },
    { n: '5', title: 'Complexity Analysis',  desc: 'Fitness scores, doubling growth ratios, log-log empirical curves.' },
    { n: '6', title: 'Academic Conclusions', desc: 'Big-O formal proofs, Kadane optimality proof, Master theorem classification.' },
  ]

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{
        padding: '14px 18px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <FileText size={16} color="var(--primary-light)" />
        <h4 style={{ margin: 0, fontSize: '0.875rem' }}>Report Outline</h4>
        <span style={{
          marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>PDF / ReportLab</span>
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sections.map((s) => (
          <div key={s.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{
              width: 22, height: 22, borderRadius: 'var(--radius-sm)', flexShrink: 0,
              background: 'var(--bg-surface-2)', border: '1px solid var(--border-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary-light)',
            }}>
              {s.n}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-primary)', marginBottom: 1 }}>
                {s.title}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
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
      .catch((e) => setError(e.response?.data?.detail ?? e.message ?? 'Failed to load reportable datasets.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(loadDatasets, [loadDatasets])

  const handleDownload = async (datasetId, datasetName) => {
    setDownloading(datasetId)
    setDlError(null)
    setDlSuccess(null)
    try {
      await downloadReport(datasetId)
      setDlSuccess(`Report for "${datasetName}" generated and downloaded successfully.`)
    } catch (e) {
      setDlError(e.message ?? 'Download failed.')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>PDF Report Generator</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Export comprehensive, publication-ready academic reports containing price charts, benchmark statistics, and Big-O proofs.
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={loadDatasets}
          title="Refresh datasets"
          aria-label="Refresh reportable datasets"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Status Notifications */}
      {dlSuccess && (
        <div className="panel panel-success" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem' }}>
            <CheckCircle size={15} color="var(--success)" style={{ flexShrink: 0 }} />
            <span>{dlSuccess}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => setDlSuccess(null)}
            aria-label="Dismiss message"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {dlError && (
        <div className="panel panel-danger" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem' }}>
            <XCircle size={15} color="var(--danger)" style={{ flexShrink: 0 }} />
            <span>{dlError}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => setDlError(null)}
            aria-label="Dismiss error"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Main Layout: Datasets List + Preview Sidebar */}
      <div className="report-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

        {/* Left Column: Datasets List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h4 style={{ margin: 0 }}>Available Reportable Datasets</h4>
            {!loading && (
              <span className="badge badge-primary">{datasets.length}</span>
            )}
          </div>

          {loading && <Spinner center label="Loading datasets with report data…" />}
          {error   && <div className="panel panel-danger" style={{ fontSize: '0.8125rem' }}>{error}</div>}

          {!loading && !error && datasets.length === 0 && (
            <div className="panel panel-warning" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <AlertTriangle size={17} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.875rem' }}>
                  No Reportable Datasets Found
                </div>
                <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.55 }}>
                  A dataset must have at least one completed analysis run or benchmark result to compile a PDF report.
                  First <Link to="/datasets" style={{ color: 'var(--primary-light)' }}>generate a dataset</Link>, then execute
                  an <Link to="/analyze" style={{ color: 'var(--primary-light)' }}>algorithm analysis</Link>.
                </p>
              </div>
            </div>
          )}

          {datasets.map((ds) => (
            <DatasetCard
              key={ds.id}
              ds={ds}
              onDownload={handleDownload}
              downloading={downloading}
            />
          ))}
        </div>

        {/* Right Column: Outline Preview Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ReportPreview />

          {/* Engine Technical Specifications */}
          <div style={{
            padding: '14px 16px', background: 'var(--bg-surface-2)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Report Generator Specs
            </div>
            {[
              ['Engine',     'ReportLab Platypus'],
              ['Graphics',   'Vector Flowables'],
              ['Standard',   'ISO 32000-1 (PDF/A4)'],
              ['Resolution', '300 DPI Chart Vectors'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
