import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Cpu, Trash2, RefreshCw, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { listDatasets, generateDataset, uploadDataset, validateDataset, deleteDataset } from '../api/datasets'
import Spinner from '../components/common/Spinner'
import { SourceBadge, VerifiedBadge } from '../components/common/Badge'

const DISTRIBUTIONS = [
  { value: 'random',          label: 'Random Walk',       desc: 'Zero-drift Geometric Brownian Motion' },
  { value: 'mostly_positive', label: 'Bull Market',       desc: 'Positive upward drift' },
  { value: 'mostly_negative', label: 'Bear Market',       desc: 'Negative downward drift' },
  { value: 'high_volatility', label: 'High Volatility',   desc: 'Wide price amplitude swings' },
  { value: 'low_volatility',  label: 'Low Volatility',    desc: 'Stable, tightly bounded price series' },
]

const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB safety limit

// ── Generate Form ──────────────────────────────────────────────────────────────
function GenerateForm({ onGenerated }) {
  const [form, setForm] = useState({
    name: '',
    size: 10000,
    distribution_type: 'random',
    start_price: '100.00',
    seed: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [result, setResult]   = useState(null)

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (error) setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return

    // Client-side validation
    const numSize = Number(form.size)
    if (!numSize || numSize < 1000 || numSize > 1000000) {
      setError('Dataset size must be between 1,000 and 1,000,000 points.')
      return
    }

    const numStartPrice = parseFloat(form.start_price)
    if (isNaN(numStartPrice) || numStartPrice <= 0) {
      setError('Starting price must be a valid positive number greater than $0.00.')
      return
    }

    let parsedSeed = null
    if (form.seed !== '') {
      const s = parseInt(form.seed, 10)
      if (isNaN(s) || s < 0) {
        setError('Seed must be a valid non-negative integer.')
        return
      }
      parsedSeed = s
    }

    const trimmedName = form.name.trim() || `${DISTRIBUTIONS.find((d) => d.value === form.distribution_type)?.label ?? 'Dataset'} N=${numSize.toLocaleString()}`

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const payload = {
        name: trimmedName,
        size: numSize,
        distribution_type: form.distribution_type,
        start_price: numStartPrice,
        seed: parsedSeed,
      }
      const data = await generateDataset(payload)
      setResult(data)
      onGenerated?.()
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to generate dataset.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="form-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="form-group">
          <label htmlFor="gen-name" className="form-label">Dataset Name (optional)</label>
          <input
            id="gen-name"
            className="form-input"
            placeholder="e.g. Bull Market 50K"
            value={form.name}
            maxLength={255}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="gen-dist" className="form-label">Price Distribution Profile</label>
          <select
            id="gen-dist"
            className="form-select"
            value={form.distribution_type}
            onChange={(e) => set('distribution_type', e.target.value)}
          >
            {DISTRIBUTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label} — {d.desc}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="gen-size" className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Dataset Size (N)</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 700 }}>
            {Number(form.size).toLocaleString()} points
          </span>
        </label>
        <input
          id="gen-size"
          type="range"
          className="form-range"
          min={1000}
          max={1000000}
          step={1000}
          value={form.size}
          onChange={(e) => set('size', e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
          <span>1K</span><span>50K</span><span>100K</span><span>500K</span><span>1M (max)</span>
        </div>
      </div>

      <div className="form-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="form-group">
          <label htmlFor="gen-price" className="form-label">Starting Price ($)</label>
          <input
            id="gen-price"
            type="number"
            className="form-input"
            value={form.start_price}
            min="0.01"
            step="0.01"
            onChange={(e) => set('start_price', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="gen-seed" className="form-label">Random Seed (optional)</label>
          <input
            id="gen-seed"
            type="number"
            className="form-input"
            placeholder="Leave blank for random generation"
            value={form.seed}
            min="0"
            step="1"
            onChange={(e) => set('seed', e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="panel panel-danger" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} color="var(--danger)" style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="panel panel-success" style={{ fontSize: '0.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontWeight: 600 }}>
            <CheckCircle size={15} />
            <span>{result.cached ? 'Returned from cache (SHA-256 match)' : 'Dataset generated and stored'}</span>
          </div>
          <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
            ID: <code style={{ color: 'var(--success)' }}>#{result.dataset_id}</code>
            &nbsp;·&nbsp;N = {result.size?.toLocaleString()}
            &nbsp;·&nbsp;${result.stats?.min_price?.toFixed(2)} – ${result.stats?.max_price?.toFixed(2)}
            &nbsp;·&nbsp;SHA-256: <code style={{ fontSize: '0.75rem' }}>{result.sha256_hash?.slice(0, 16)}…</code>
          </div>
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={loading}
        style={{ alignSelf: 'flex-start' }}
      >
        {loading ? <Spinner size={16} /> : <Cpu size={16} />}
        {loading ? 'Generating dataset…' : 'Generate Dataset'}
      </button>
    </form>
  )
}

// ── Upload Zone ────────────────────────────────────────────────────────────────
function UploadZone({ onUploaded }) {
  const fileInputRef            = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile]         = useState(null)
  const [validation, setValid]  = useState(null)
  const [name, setName]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [result, setResult]     = useState(null)

  const handleFile = async (f) => {
    if (!f) return
    setError(null)
    setValid(null)
    setResult(null)

    // Validate file extension
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (!['.csv', '.xlsx'].includes(ext)) {
      setError(`Invalid file format "${ext}". Supported formats are .csv and .xlsx.`)
      setFile(null)
      return
    }

    // Validate size limit (50 MB)
    if (f.size > MAX_UPLOAD_SIZE_BYTES) {
      setError(`File size (${(f.size / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed limit of 50 MB.`)
      setFile(null)
      return
    }

    setFile(f)
    if (!name.trim()) {
      setName(f.name.replace(/\.[^.]+$/, ''))
    }

    try {
      const v = await validateDataset(f)
      setValid(v)
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'File validation failed.')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) handleFile(f)
  }

  const handleUpload = async () => {
    if (!file || loading) return
    const uploadName = name.trim() || file.name.replace(/\.[^.]+$/, '')
    setLoading(true)
    setError(null)

    try {
      const data = await uploadDataset(uploadName, file)
      setResult(data)
      onUploaded?.()
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to upload dataset.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.[0]) handleFile(e.target.files[0])
        }}
      />

      <div
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
        tabIndex={0}
        role="button"
        aria-label="Upload dataset file"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={30} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
        <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 4 }}>
          {file ? file.name : 'Choose a file or drag & drop here'}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {file ? `${(file.size / 1024).toFixed(1)} KB` : 'CSV or XLSX · Max 50 MB'}
        </div>
      </div>

      {validation && (
        <div className={`panel ${validation.is_valid ? 'panel-success' : 'panel-danger'}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: validation.is_valid ? 'var(--success)' : 'var(--danger)' }}>
            {validation.is_valid ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
            <span>{validation.is_valid ? 'File structure valid' : 'Invalid file structure'}</span>
          </div>
          {validation.is_valid && (
            <div style={{ marginTop: 6, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Detected Column: <code>{validation.price_column_detected}</code>
              &nbsp;·&nbsp;{validation.valid_rows?.toLocaleString()} valid price rows
            </div>
          )}
          {validation.warnings?.map((w, i) => (
            <div key={i} style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--warning)' }}>
              ⚠ {w.message}
            </div>
          ))}
        </div>
      )}

      {file && (
        <div className="form-group">
          <label htmlFor="upload-ds-name" className="form-label">Dataset Name</label>
          <input
            id="upload-ds-name"
            className="form-input"
            value={name}
            maxLength={255}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}

      {error && (
        <div className="panel panel-danger" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} color="var(--danger)" style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="panel panel-success" style={{ fontSize: '0.875rem' }}>
          ✓ Upload complete: Stored as Dataset #{result.dataset_id} ({result.size?.toLocaleString()} rows)
        </div>
      )}

      {file && validation?.is_valid && (
        <button
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={loading}
          style={{ alignSelf: 'flex-start' }}
        >
          {loading ? <Spinner size={16} /> : <Upload size={16} />}
          {loading ? 'Uploading & parsing…' : 'Upload Dataset'}
        </button>
      )}
    </div>
  )
}

// ── Dataset List ───────────────────────────────────────────────────────────────
function DatasetList({ refresh }) {
  const [page, setPage]               = useState(1)
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [deleteError, setDeleteError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    listDatasets(page, 10)
      .then(setData)
      .catch((err) => {
        setDeleteError(err.response?.data?.detail ?? err.message ?? 'Failed to load datasets.')
      })
      .finally(() => setLoading(false))
  }, [page, refresh])

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete dataset #${id} ("${name}") and all its analysis results?`)) {
      return
    }
    setDeleteError(null)
    try {
      await deleteDataset(id)
      const updated = await listDatasets(page, 10)
      setData(updated)
    } catch (err) {
      setDeleteError(err.response?.data?.detail ?? err.message ?? 'Failed to delete dataset.')
    }
  }

  if (loading) return <Spinner center label="Loading datasets…" />

  if (deleteError) {
    return (
      <div className="panel panel-danger" style={{ margin: '16px 0', fontSize: '0.875rem' }}>
        <AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />
        {deleteError}
      </div>
    )
  }

  if (!data?.items?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        No datasets available. Generate a synthetic dataset or upload a CSV/XLSX above.
      </div>
    )
  }

  const totalPages = Math.ceil((data.total ?? 0) / 10) || 1

  return (
    <div>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Size (N)</th>
              <th>Distribution</th>
              <th>Source</th>
              <th>Price Range</th>
              <th>Verified</th>
              <th>Created</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((ds) => (
              <tr key={ds.id}>
                <td className="td-mono" style={{ color: 'var(--text-muted)' }}>#{ds.id}</td>
                <td className="td-primary">{ds.name}</td>
                <td className="td-mono">{ds.size?.toLocaleString()}</td>
                <td>
                  <span className="badge badge-muted">
                    {ds.distribution_type ?? 'uploaded'}
                  </span>
                </td>
                <td><SourceBadge source={ds.source} /></td>
                <td className="td-mono" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  ${ds.min_price?.toFixed(2)} – ${ds.max_price?.toFixed(2)}
                </td>
                <td><VerifiedBadge verified={ds.is_verified} /></td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                  {ds.created_at ? new Date(ds.created_at).toLocaleDateString() : '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-secondary btn-sm btn-icon"
                      title="Analyze dataset"
                      aria-label={`Analyze ${ds.name}`}
                      onClick={() => navigate(`/analyze?dataset_id=${ds.id}`)}
                    >
                      <ExternalLink size={15} />
                    </button>
                    <button
                      className="btn btn-danger btn-sm btn-icon"
                      title="Delete dataset"
                      aria-label={`Delete ${ds.name}`}
                      onClick={() => handleDelete(ds.id, ds.name)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {data.total > 10 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center', alignItems: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '0 8px' }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DatasetManager() {
  const [tab, setTab]         = useState('generate')
  const [refresh, setRefresh] = useState(0)
  const bump = () => setRefresh((r) => r + 1)

  const tabs = [
    { id: 'generate', label: '⚡ Generate Synthetic' },
    { id: 'upload',   label: '📂 Upload CSV / XLSX' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header Info */}
      <div>
        <h2 style={{ marginBottom: 4 }}>Dataset Manager</h2>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>
          Generate synthetic price series via Geometric Brownian Motion or upload real-world financial records.
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="segmented-control" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`segmented-item ${tab === t.id ? 'active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Form Card */}
      <div className="card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1rem' }}>
            {tab === 'generate' ? 'Generate Synthetic Dataset' : 'Upload Price File'}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.8125rem' }}>
            {tab === 'generate'
              ? 'Log-Normal GBM with 5 drift/volatility profiles. Duplicate sequences are identified by SHA-256 hash.'
              : 'Upload CSV or Excel spreadsheets. Column headers supported: close, adj_close, price, value, open, high, low.'}
          </p>
        </div>
        <div style={{ padding: '20px' }}>
          {tab === 'generate' ? <GenerateForm onGenerated={bump} /> : <UploadZone onUploaded={bump} />}
        </div>
      </div>

      {/* Dataset List */}
      <div className="card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0 }}>Stored Datasets</h4>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            title="Refresh list"
            aria-label="Refresh datasets list"
            onClick={bump}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div style={{ padding: '16px' }}>
          <DatasetList refresh={refresh} />
        </div>
      </div>
    </div>
  )
}
