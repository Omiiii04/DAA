import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PlayCircle, RefreshCw, AlertCircle, CheckCircle, Info, FileText } from 'lucide-react'
import { listDatasets, getDatasetPrices } from '../api/datasets'
import { runAnalysis } from '../api/analysis'
import PriceChart from '../components/charts/PriceChart'
import Spinner from '../components/common/Spinner'
import { ComplexityBadge } from '../components/common/Badge'

const ALGORITHMS = [
  { name: 'Brute Force',        complexity: 'O(N²)',      color: 'var(--algo-bf)', limit: 20_000 },
  { name: 'Divide & Conquer',   complexity: 'O(N log N)', color: 'var(--algo-dc)', limit: 100_000 },
  { name: "Kadane's Algorithm", complexity: 'O(N)',        color: 'var(--algo-kadane)', limit: 1_000_000 },
]

// ── Result Card per algorithm ──────────────────────────────────────────────────
function ResultCard({ result }) {
  const algo = ALGORITHMS.find((a) => a.name === result.algorithm_name)
  const color = algo?.color ?? 'var(--accent)'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid var(--card-border)`,
        borderTop: `4px solid ${color}`,
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow-raised-sm)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color, flexShrink: 0,
        }} />
        <span style={{ fontWeight: 700, fontSize: '0.875rem', flex: 1 }}>
          {result.algorithm_name}
        </span>
        <ComplexityBadge complexity={result.time_complexity} />
      </div>

      {/* Profit highlight */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 2 }}>
          Maximum Profit
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '1.5rem',
          fontWeight: 800,
          color,
          lineHeight: 1.1,
        }}>
          +${typeof result.max_profit === 'number' ? result.max_profit.toFixed(4) : '0.0000'}
        </div>
      </div>

      {/* Buy / Sell */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '10px 14px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--success)', marginBottom: 2 }}>Buy Point</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
            ${typeof result.buy_price === 'number' ? result.buy_price.toFixed(2) : '—'}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            idx {result.buy_index?.toLocaleString()}
          </div>
        </div>
        <div style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--danger)', marginBottom: 2 }}>Sell Point</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
            ${typeof result.sell_price === 'number' ? result.sell_price.toFixed(2) : '—'}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            idx {result.sell_index?.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Hold duration */}
      <div style={{ padding: '10px 14px', background: 'var(--surface-well)', marginTop: 'auto', borderTop: '1px solid var(--divider)' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Holding period: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
            {result.sell_index != null && result.buy_index != null
              ? (result.sell_index - result.buy_index).toLocaleString()
              : '—'} days
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Dataset Selector ───────────────────────────────────────────────────────────
function DatasetSelector({ selectedId, onSelect }) {
  const [datasets, setDatasets] = useState([])
  const [loading, setLoading]   = useState(false)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    setLoading(true)
    listDatasets(1, 100)
      .then((d) => setDatasets(d.items ?? []))
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loadError) {
    return <div style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>Failed to load datasets</div>
  }

  return (
    <select
      id="analysis-dataset-select"
      className="form-select"
      value={selectedId ?? ''}
      disabled={loading}
      onChange={(e) => onSelect(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">— Select a dataset to analyze —</option>
      {datasets.map((ds) => (
        <option key={ds.id} value={ds.id}>
          #{ds.id} {ds.name} (N={ds.size?.toLocaleString()})
        </option>
      ))}
    </select>
  )
}

// ── Algorithm Selector ─────────────────────────────────────────────────────────
function AlgorithmSelector({ datasetSize, selectedAlgos, onToggle }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ALGORITHMS.map((algo) => {
        const tooLarge = datasetSize && datasetSize > algo.limit
        const checked  = selectedAlgos.includes(algo.name)
        return (
          <label
            key={algo.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              background: 'var(--surface)',
              boxShadow: checked && !tooLarge ? 'var(--shadow-inset)' : 'var(--shadow-raised-sm)',
              border: `1px solid ${checked && !tooLarge ? 'var(--accent)' : 'var(--card-border)'}`,
              borderRadius: 'var(--radius-sm)',
              cursor: tooLarge ? 'not-allowed' : 'pointer',
              opacity: tooLarge ? 0.45 : 1,
              transition: 'all var(--transition-fast)',
            }}
          >
            <input
              type="checkbox"
              className="form-checkbox"
              checked={checked && !tooLarge}
              disabled={tooLarge}
              onChange={() => !tooLarge && onToggle(algo.name)}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: algo.color }}>
                {algo.name}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {algo.complexity}
                {tooLarge ? ` · Exceeds limit (${algo.limit.toLocaleString()})` : ''}
              </div>
            </div>
            <ComplexityBadge complexity={algo.complexity} />
          </label>
        )
      })}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AnalysisView() {
  const [searchParams] = useSearchParams()
  const initDatasetId  = searchParams.get('dataset_id') ? Number(searchParams.get('dataset_id')) : null

  const [datasetId,     setDatasetId]     = useState(initDatasetId)
  const [priceData,     setPriceData]     = useState(null)
  const [datasetSize,   setDatasetSize]   = useState(null)
  const [selectedAlgos, setSelectedAlgos] = useState(ALGORITHMS.map((a) => a.name))
  const [running,       setRunning]       = useState(false)
  const [results,       setResults]       = useState(null)
  const [cached,        setCached]        = useState(false)
  const [verified,      setVerified]      = useState(null)
  const [notes,         setNotes]         = useState([])
  const [error,         setError]         = useState(null)
  const [priceLoading,  setPriceLoading]  = useState(false)

  // Synchronize when URL searchParams changes
  useEffect(() => {
    const paramId = searchParams.get('dataset_id')
    if (paramId) {
      const parsed = Number(paramId)
      if (!isNaN(parsed) && parsed !== datasetId) {
        setDatasetId(parsed)
      }
    }
  }, [searchParams])

  // Load prices when dataset changes
  useEffect(() => {
    if (!datasetId) {
      setPriceData(null)
      setDatasetSize(null)
      setResults(null)
      return
    }
    setPriceLoading(true)
    setError(null)
    getDatasetPrices(datasetId)
      .then((d) => {
        setPriceData(d)
        setDatasetSize(d.original_size)
      })
      .catch((err) => {
        setError(err.response?.data?.detail ?? err.message ?? 'Failed to load price data.')
      })
      .finally(() => setPriceLoading(false))
  }, [datasetId])

  const toggleAlgo = useCallback((name) => {
    setSelectedAlgos((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }, [])

  const handleRun = async () => {
    if (!datasetId || selectedAlgos.length === 0 || running) return
    setRunning(true)
    setError(null)
    setResults(null)
    try {
      const payload = { dataset_id: datasetId, algorithms: selectedAlgos }
      const data = await runAnalysis(payload)
      setResults(data.results)
      setCached(data.cached)
      setVerified(data.verification_passed)
      setNotes(data.verification_notes ?? [])
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Analysis failed to execute.')
    } finally {
      setRunning(false)
    }
  }

  const canRun = datasetId && selectedAlgos.length > 0 && !running

  return (
    <div className="analysis-grid" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>

      {/* ── Control Panel (Left) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Dataset Selection */}
        <div className="card">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '0.875rem', margin: 0 }}>Target Dataset</h4>
          </div>
          <div style={{ padding: 14 }}>
            <DatasetSelector selectedId={datasetId} onSelect={setDatasetId} />
            {priceData && (
              <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Size: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{priceData.original_size?.toLocaleString()}</span> points
                {priceData.is_downsampled && (
                  <span style={{ color: 'var(--info)', marginLeft: 6 }}>
                    (downsampled to {priceData.returned_size?.toLocaleString()})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Algorithm Selection */}
        <div className="card">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '0.875rem', margin: 0 }}>Select Algorithms</h4>
          </div>
          <div style={{ padding: 14 }}>
            <AlgorithmSelector
              datasetSize={datasetSize}
              selectedAlgos={selectedAlgos}
              onToggle={toggleAlgo}
            />
          </div>
        </div>

        {/* Run Analysis Button */}
        <button
          className="btn btn-primary btn-lg"
          onClick={handleRun}
          disabled={!canRun}
          style={{ justifyContent: 'center' }}
        >
          {running ? <Spinner size={17} /> : <PlayCircle size={17} />}
          {running ? 'Executing algorithms…' : 'Run Analysis'}
        </button>

        {/* Cross-Verification & Cache status */}
        {results && (
          <div className={`panel ${verified ? 'panel-success' : 'panel-warning'}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: '0.8125rem', fontWeight: 700 }}>
              {verified ? <CheckCircle size={14} color="var(--success)" /> : <AlertCircle size={14} color="var(--warning)" />}
              <span>{verified ? 'Cross-Verification Passed' : 'Verification Discrepancy'}</span>
            </div>
            {notes.map((n, i) => (
              <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{n}</div>
            ))}
            {cached && (
              <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--info)' }}>
                ⚡ Results retrieved from content-addressed cache (zero recomputation)
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="panel panel-danger" style={{ fontSize: '0.8125rem', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <AlertCircle size={14} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}

        {/* D&C Breakdown Note */}
        {results?.['Divide & Conquer'] && (
          <div className="panel panel-info" style={{ fontSize: '0.75rem' }}>
            <div style={{ fontWeight: 700, color: 'var(--info)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Info size={13} />
              <span>Divide & Conquer Merge Sums</span>
            </div>
            {results['Divide & Conquer'].left_sum != null && (
              <div style={{ color: 'var(--text-secondary)' }}>Left Subproblem: <span style={{ fontFamily: 'var(--font-mono)' }}>{results['Divide & Conquer'].left_sum?.toFixed(4)}</span></div>
            )}
            {results['Divide & Conquer'].cross_sum != null && (
              <div style={{ color: 'var(--text-secondary)' }}>Crossing Subproblem: <span style={{ fontFamily: 'var(--font-mono)' }}>{results['Divide & Conquer'].cross_sum?.toFixed(4)}</span></div>
            )}
            {results['Divide & Conquer'].right_sum != null && (
              <div style={{ color: 'var(--text-secondary)' }}>Right Subproblem: <span style={{ fontFamily: 'var(--font-mono)' }}>{results['Divide & Conquer'].right_sum?.toFixed(4)}</span></div>
            )}
          </div>
        )}
      </div>

      {/* ── Main Panel: Chart & Results (Right) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

        {/* Price Chart */}
        <div className="card">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '0.875rem' }}>Price Series Visualization</h4>
            {datasetId && (
              <button
                className="btn btn-ghost btn-sm btn-icon"
                title="Refresh prices"
                aria-label="Refresh price data"
                onClick={() => {
                  setPriceLoading(true)
                  getDatasetPrices(datasetId)
                    .then(setPriceData)
                    .catch((err) => setError(err.message))
                    .finally(() => setPriceLoading(false))
                }}
              >
                <RefreshCw size={13} />
              </button>
            )}
          </div>
          <div style={{ padding: '16px 18px 20px' }}>
            {priceLoading
              ? <Spinner center label="Loading price series…" />
              : <PriceChart priceData={priceData} results={results} height={360} />}
          </div>
        </div>

        {/* Result Cards */}
        {results && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>Algorithm Performance Outputs</h4>
              <Link
                to="/reports"
                className="btn btn-ghost btn-sm"
                style={{ gap: 6 }}
              >
                <FileText size={13} />
                Download PDF Report
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {Object.values(results).map((r) => (
                <ResultCard key={r.algorithm_name} result={r} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!datasetId && (
          <div style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border-strong)',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📈</div>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>No Dataset Selected</div>
            <div style={{ fontSize: '0.8125rem' }}>Select a dataset from the left panel to load the price series and execute subarray algorithms.</div>
          </div>
        )}
      </div>
    </div>
  )
}
