import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Cpu, Trash2, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { listDatasets, generateDataset, uploadDataset, validateDataset, deleteDataset } from '../api/datasets'
import Spinner from '../components/common/Spinner'
import { ComplexityBadge, SourceBadge, VerifiedBadge } from '../components/common/Badge'

const DISTRIBUTIONS = [
  { value: 'random',          label: 'Random Walk',       desc: 'Zero-drift GBM' },
  { value: 'mostly_positive', label: 'Bull Market',       desc: 'Positive drift' },
  { value: 'mostly_negative', label: 'Bear Market',       desc: 'Negative drift' },
  { value: 'high_volatility', label: 'High Volatility',   desc: 'Wide price swings' },
  { value: 'low_volatility',  label: 'Low Volatility',    desc: 'Stable price series' },
]

// ── Generate Form ──────────────────────────────────────────────────────────────
function GenerateForm({ onGenerated }) {
  const [form, setForm] = useState({ name: '', size: 10000, distribution_type: 'random', start_price: 100, seed: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [result, setResult]   = useState(null)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null); setResult(null)
    try {
      const payload = {
        name: form.name || `Dataset N=${form.size.toLocaleString()}`,
        size: Number(form.size),
        distribution_type: form.distribution_type,
        start_price: Number(form.start_price),
        seed: form.seed !== '' ? Number(form.seed) : null,
      }
      const data = await generateDataset(payload)
      setResult(data)
      onGenerated?.()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="form-group">
          <label className="form-label">Dataset Name</label>
          <input className="form-input" placeholder="e.g. Bull Market 50K" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Distribution</label>
          <select className="form-select" value={form.distribution_type} onChange={(e) => set('distribution_type', e.target.value)}>
            {DISTRIBUTIONS.map((d) => <option key={d.value} value={d.value}>{d.label} — {d.desc}</option>)}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Dataset Size (N)</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-light)' }}>
            {Number(form.size).toLocaleString()} points
          </span>
        </label>
        <input
          type="range" className="form-range"
          min={1000} max={1000000} step={1000}
          value={form.size} onChange={(e) => set('size', e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
          <span>1K (min)</span><span>50K</span><span>100K</span><span>500K</span><span>1M (max)</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="form-group">
          <label className="form-label">Starting Price ($)</label>
          <input type="number" className="form-input" value={form.start_price} min={0.01} step={0.01} onChange={(e) => set('start_price', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Random Seed (optional)</label>
          <input type="number" className="form-input" placeholder="Leave blank for random" value={form.seed} onChange={(e) => set('seed', e.target.value)} />
        </div>
      </div>

      {error && <div className="panel panel-danger" style={{ fontSize: '0.875rem' }}><AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />{error}</div>}

      {result && (
        <div className="panel panel-success" style={{ fontSize: '0.875rem' }}>
          <strong style={{ color: 'var(--success)' }}>✓ {result.cached ? 'Returned from cache' : 'Dataset generated'}</strong>
          <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
            ID: <code style={{ color: 'var(--success)' }}>#{result.dataset_id}</code>
            &nbsp;·&nbsp;N = {result.size?.toLocaleString()}
            &nbsp;·&nbsp;${result.stats?.min_price?.toFixed(2)} – ${result.stats?.max_price?.toFixed(2)}
            &nbsp;·&nbsp;SHA-256: <code style={{ fontSize: '0.75rem' }}>{result.sha256_hash?.slice(0, 12)}…</code>
          </div>
        </div>
      )}

      <button type="submit" className="btn btn-primary" disabled={loading} style={{ alignSelf: 'flex-start' }}>
        {loading ? <Spinner size={16} /> : <Cpu size={16} />}
        {loading ? 'Generating…' : 'Generate Dataset'}
      </button>
    </form>
  )
}

// ── Upload Zone ────────────────────────────────────────────────────────────────
function UploadZone({ onUploaded }) {
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile]         = useState(null)
  const [validation, setValid]  = useState(null)
  const [name, setName]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [result, setResult]     = useState(null)

  const handleFile = async (f) => {
    setFile(f); setValid(null); setError(null); setResult(null)
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
    try {
      const v = await validateDataset(f)
      setValid(v)
    } catch (err) { setError(err.message) }
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true); setError(null)
    try {
      const data = await uploadDataset(name || file.name, file)
      setResult(data); onUploaded?.()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input').click()}
      >
        <input id="file-input" type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />
        <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {file ? file.name : 'Drop CSV or XLSX here'}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {file ? `${(file.size / 1024).toFixed(1)} KB` : 'or click to browse — .csv, .xlsx supported'}
        </div>
      </div>

      {validation && (
        <div className={`panel ${validation.is_valid ? 'panel-success' : 'panel-danger'}`}>
          <strong style={{ color: validation.is_valid ? 'var(--success)' : 'var(--danger)' }}>
            {validation.is_valid ? '✓ Valid file' : '✗ Invalid file'}
          </strong>
          {validation.is_valid && (
            <div style={{ marginTop: 6, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Column: <code>{validation.price_column_detected}</code>
              &nbsp;·&nbsp;{validation.valid_rows?.toLocaleString()} valid rows
            </div>
          )}
          {validation.warnings?.map((w, i) => (
            <div key={i} style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--warning)' }}>⚠ {w.message}</div>
          ))}
        </div>
      )}

      {file && (
        <div className="form-group">
          <label className="form-label">Dataset Name</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}

      {error && <div className="panel panel-danger" style={{ fontSize: '0.875rem' }}>{error}</div>}

      {result && (
        <div className="panel panel-success" style={{ fontSize: '0.875rem' }}>
          ✓ Uploaded as Dataset #{result.dataset_id}
        </div>
      )}

      {file && validation?.is_valid && (
        <button className="btn btn-success" onClick={handleUpload} disabled={loading} style={{ alignSelf: 'flex-start' }}>
          {loading ? <Spinner size={16} /> : <Upload size={16} />}
          {loading ? 'Uploading…' : 'Upload Dataset'}
        </button>
      )}
    </div>
  )
}

// ── Dataset List ───────────────────────────────────────────────────────────────
function DatasetList({ refresh }) {
  const [page, setPage]       = useState(1)
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    listDatasets(page, 10).then(setData).finally(() => setLoading(false))
  }, [page, refresh])

  const handleDelete = async (id) => {
    if (!confirm('Delete this dataset and all its results?')) return
    await deleteDataset(id)
    listDatasets(page, 10).then(setData)
  }

  if (loading) return <Spinner center label="Loading datasets…" />
  if (!data?.items?.length) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
      No datasets yet. Generate or upload one above.
    </div>
  )

  return (
    <div>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th><th>Name</th><th>Size (N)</th><th>Type</th><th>Source</th><th>Price Range</th><th>Verified</th><th>Date</th><th></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((ds, i) => (
              <motion.tr
                key={ds.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <td className="td-mono" style={{ color: 'var(--text-muted)' }}>#{ds.id}</td>
                <td className="td-primary">{ds.name}</td>
                <td className="td-mono">{ds.size?.toLocaleString()}</td>
                <td><span className="badge badge-muted">{ds.distribution_type ?? 'uploaded'}</span></td>
                <td><SourceBadge source={ds.source} /></td>
                <td className="td-mono" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  ${ds.min_price?.toFixed(2)} – ${ds.max_price?.toFixed(2)}
                </td>
                <td><VerifiedBadge verified={ds.is_verified} /></td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                  {new Date(ds.created_at).toLocaleDateString()}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Analyze" onClick={() => navigate(`/analyze?dataset_id=${ds.id}`)}>
                      <ExternalLink size={13} />
                    </button>
                    <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={() => handleDelete(ds.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      {data.total > 10 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span style={{ lineHeight: '32px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Page {page} of {Math.ceil(data.total / 10)}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={page * 10 >= data.total} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DatasetManager() {
  const [tab, setTab]       = useState('generate')
  const [refresh, setRefresh] = useState(0)
  const bump = () => setRefresh((r) => r + 1)

  const tabs = [
    { id: 'generate', label: '⚡ Generate Synthetic' },
    { id: 'upload',   label: '📂 Upload CSV / XLSX' },
  ]

  return (
    <div>
      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 4, alignSelf: 'flex-start', width: 'fit-content' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 8 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Form Card */}
      <motion.div
        className="card"
        key={tab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 24 }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h3>{tab === 'generate' ? '⚡ Generate Synthetic Dataset' : '📂 Upload Price File'}</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.875rem' }}>
            {tab === 'generate'
              ? 'Log-Normal GBM with 5 distribution profiles. Results cached by SHA-256 hash.'
              : 'Upload CSV or XLSX. Supported columns: close, adj_close, price, value, open, high, low.'}
          </p>
        </div>
        <div style={{ padding: '24px' }}>
          {tab === 'generate' ? <GenerateForm onGenerated={bump} /> : <UploadZone onUploaded={bump} />}
        </div>
      </motion.div>

      {/* Dataset List */}
      <div className="card">
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4>All Datasets</h4>
          <button className="btn btn-ghost btn-sm btn-icon" title="Refresh" onClick={bump}>
            <RefreshCw size={14} />
          </button>
        </div>
        <div style={{ padding: '12px 8px' }}>
          <DatasetList refresh={refresh} />
        </div>
      </div>
    </div>
  )
}
