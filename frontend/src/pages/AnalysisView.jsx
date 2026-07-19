import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Link, useSearchParams } from 'react-router-dom'
import { PlayCircle, RefreshCw, AlertCircle, CheckCircle, Info, FileText } from 'lucide-react'
import { listDatasets, getDatasetPrices } from '../api/datasets'
import { runAnalysis } from '../api/analysis'
import PriceChart from '../components/charts/PriceChart'
import Spinner from '../components/common/Spinner'
import { ComplexityBadge } from '../components/common/Badge'

const ALGORITHMS = [
  { name: 'Brute Force',        complexity: 'O(N²)',      color: '#ef4444', limit: 20_000 },
  { name: 'Divide & Conquer',   complexity: 'O(N log N)', color: '#f59e0b', limit: 100_000 },
  { name: "Kadane's Algorithm", complexity: 'O(N)',        color: '#10b981', limit: 1_000_000 },
]

// ── Result Card per algorithm ──────────────────────────────────────────────────
function ResultCard({ result, delay = 0 }) {
  const algo = ALGORITHMS.find((a) => a.name === result.algorithm_name)
  const color = algo?.color ?? '#94a3b8'
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      style={{
        background: 'var(--bg-surface-2)',
        border: `1px solid ${color}25`,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: `${color}08`,
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: color, boxShadow: `0 0 8px ${color}80`, flexShrink: 0,
        }} />
        <span style={{ fontWeight: 700, fontSize: '0.9375rem', flex: 1 }}>{result.algorithm_name}</span>
        <ComplexityBadge complexity={result.time_complexity} />
      </div>

      {/* Profit highlight */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>
          Max Profit
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '1.75rem',
          fontWeight: 800,
          color,
          lineHeight: 1,
        }}>
          +${result.max_profit?.toFixed(4)}
        </div>
      </div>

      {/* Buy / Sell */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--success)', marginBottom: 3 }}>Buy</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
            ${result.buy_price?.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>idx {result.buy_index?.toLocaleString()}</div>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--danger)', marginBottom: 3 }}>Sell</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
            ${result.sell_price?.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>idx {result.sell_index?.toLocaleString()}</div>
        </div>
      </div>

      {/* Hold duration */}
      <div style={{ padding: '10px 16px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Hold: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            {(result.sell_index - result.buy_index)?.toLocaleString()} trading days
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Dataset Selector ───────────────────────────────────────────────────────────
function DatasetSelector({ selectedId, onSelect }) {
  const [datasets, setDatasets] = useState([])
  useEffect(() => {
    listDatasets(1, 100).then((d) => setDatasets(d.items ?? []))
  }, [])

  return (
    <select
      className="form-select"
      value={selectedId ?? ''}
      onChange={(e) => onSelect(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">— Select a dataset —</option>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ALGORITHMS.map((algo) => {
        const tooLarge = datasetSize && datasetSize > algo.limit
        const checked  = selectedAlgos.includes(algo.name)
        return (
          <label
            key={algo.name}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              background: checked && !tooLarge ? `${algo.color}0d` : 'var(--bg-surface-2)',
              border: `1px solid ${checked && !tooLarge ? algo.color + '35' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              cursor: tooLarge ? 'not-allowed' : 'pointer',
              opacity: tooLarge ? 0.45 : 1,
              transition: 'all 0.15s ease',
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
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: algo.color }}>{algo.name}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {algo.complexity}
                {tooLarge ? ` — N exceeds ${algo.limit.toLocaleString()} limit` : ''}
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

  const [datasetId,   setDatasetId]   = useState(initDatasetId)
  const [priceData,   setPriceData]   = useState(null)
  const [datasetSize, setDatasetSize] = useState(null)
  const [selectedAlgos, setSelectedAlgos] = useState(ALGORITHMS.map((a) => a.name))
  const [running,     setRunning]     = useState(false)
  const [results,     setResults]     = useState(null)
  const [cached,      setCached]      = useState(false)
  const [verified,    setVerified]    = useState(null)
  const [notes,       setNotes]       = useState([])
  const [error,       setError]       = useState(null)
  const [priceLoading, setPriceLoading] = useState(false)

  // Load prices when dataset changes
  useEffect(() => {
    if (!datasetId) { setPriceData(null); setDatasetSize(null); return }
    setPriceLoading(true)
    setResults(null)
    getDatasetPrices(datasetId)
      .then((d) => {
        setPriceData(d)
        setDatasetSize(d.original_size)
      })
      .finally(() => setPriceLoading(false))
  }, [datasetId])

  const toggleAlgo = useCallback((name) => {
    setSelectedAlgos((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }, [])

  const handleRun = async () => {
    if (!datasetId && !priceData) return
    setRunning(true); setError(null); setResults(null)
    try {
      const payload = { dataset_id: datasetId, algorithms: selectedAlgos }
      const data = await runAnalysis(payload)
      setResults(data.results)
      setCached(data.cached)
      setVerified(data.verification_passed)
      setNotes(data.verification_notes ?? [])
    } catch (err) { setError(err.message) }
    finally { setRunning(false) }
  }

  const canRun = datasetId && selectedAlgos.length > 0 && !running

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, minHeight: 'calc(100vh - 120px)' }}>

      {/* ── Control Panel ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Dataset Selector */}
        <div className="card">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '0.9375rem' }}>Dataset</h4>
          </div>
          <div style={{ padding: 16 }}>
            <DatasetSelector selectedId={datasetId} onSelect={setDatasetId} />
            {priceData && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  N = <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{priceData.original_size?.toLocaleString()}</span>
                  {priceData.is_downsampled && (
                    <span style={{ color: 'var(--info)', marginLeft: 6 }}>
                      (chart: {priceData.returned_size?.toLocaleString()} pts)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Algorithm Selector */}
        <div className="card">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '0.9375rem' }}>Algorithms</h4>
          </div>
          <div style={{ padding: 16 }}>
            <AlgorithmSelector
              datasetSize={datasetSize}
              selectedAlgos={selectedAlgos}
              onToggle={toggleAlgo}
            />
          </div>
        </div>

        {/* Run Button */}
        <button
          className="btn btn-primary btn-lg"
          onClick={handleRun}
          disabled={!canRun}
          style={{ justifyContent: 'center' }}
        >
          {running ? <Spinner size={18} /> : <PlayCircle size={18} />}
          {running ? 'Analyzing…' : 'Run Analysis'}
        </button>

        {/* Cache / Verification notice */}
        {results && (
          <div className={`panel ${verified ? 'panel-success' : 'panel-warning'}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: '0.75rem', fontWeight: 700 }}>
              {verified ? <CheckCircle size={13} color="var(--success)" /> : <AlertCircle size={13} color="var(--warning)" />}
              {verified ? 'Cross-Verified ✓' : 'Verification Warning'}
            </div>
            {notes.map((n, i) => <div key={i} style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{n}</div>)}
            {cached && (
              <div style={{ marginTop: 6, fontSize: '0.7rem', color: 'var(--info)' }}>
                ⚡ Returned from cache (no recomputation)
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="panel panel-danger" style={{ fontSize: '0.8125rem' }}>
            <AlertCircle size={13} style={{ display: 'inline', marginRight: 6 }} />
            {error}
          </div>
        )}

        {/* D&C Explanation */}
        {results?.['Divide & Conquer'] && (
          <div className="panel panel-info" style={{ fontSize: '0.75rem' }}>
            <div style={{ fontWeight: 700, color: 'var(--info)', marginBottom: 4 }}>
              <Info size={12} style={{ display: 'inline', marginRight: 4 }} />
              D&C Sub-problem Sums
            </div>
            {results['Divide & Conquer'].left_sum != null && (
              <div style={{ color: 'var(--text-muted)' }}>Left: <span style={{ fontFamily: 'var(--font-mono)' }}>{results['Divide & Conquer'].left_sum?.toFixed(4)}</span></div>
            )}
            {results['Divide & Conquer'].cross_sum != null && (
              <div style={{ color: 'var(--text-muted)' }}>Cross: <span style={{ fontFamily: 'var(--font-mono)' }}>{results['Divide & Conquer'].cross_sum?.toFixed(4)}</span></div>
            )}
            {results['Divide & Conquer'].right_sum != null && (
              <div style={{ color: 'var(--text-muted)' }}>Right: <span style={{ fontFamily: 'var(--font-mono)' }}>{results['Divide & Conquer'].right_sum?.toFixed(4)}</span></div>
            )}
          </div>
        )}
      </div>

      {/* ── Chart + Results ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

        {/* Price Chart */}
        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
            <h4 style={{ flex: 1, fontSize: '0.9375rem' }}>Price Series</h4>
            {datasetId && (
              <button className="btn btn-ghost btn-sm btn-icon" title="Refresh prices" onClick={() => {
                setPriceLoading(true)
                getDatasetPrices(datasetId).then(setPriceData).finally(() => setPriceLoading(false))
              }}>
                <RefreshCw size={13} />
              </button>
            )}
          </div>
          <div style={{ padding: '16px 20px 20px' }}>
            {priceLoading
              ? <Spinner center label="Loading prices…" />
              : <PriceChart priceData={priceData} results={results} height={380} />}
          </div>
        </div>

        {/* Result Cards */}
        {results && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h4>Algorithm Results</h4>
              <Link
                to="/reports"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 14px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface-2)',
                  color: 'var(--text-muted)',
                  textDecoration: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  transition: 'all 0.15s ease',
                }}
              >
                <FileText size={13} />
                Download PDF Report
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {Object.values(results).map((r, i) => (
                <ResultCard key={r.algorithm_name} result={r} delay={i * 0.08} />
              ))}
            </div>
          </div>
        )}

        {/* Empty placeholder */}
        {!datasetId && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: '0.9375rem', textAlign: 'center', padding: 40,
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', border: '1px dashed var(--border-strong)',
          }}>
            <div>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📈</div>
              <div>Select a dataset from the panel to start analysis</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
