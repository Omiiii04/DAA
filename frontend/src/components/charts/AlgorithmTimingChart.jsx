import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend
} from 'recharts'

const ALGO_COLORS = {
  'Brute Force':        '#ef4444',
  'Divide & Conquer':   '#f59e0b',
  "Kadane's Algorithm": '#10b981',
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const fullName = payload[0]?.payload?.fullName ?? label
  const size = payload[0]?.payload?.size

  return (
    <div className="chart-tooltip">
      <div style={{ marginBottom: 6, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8125rem' }}>
        {fullName} {size != null && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(N={size.toLocaleString()})</span>}
      </div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: p.color, margin: '2px 0' }}>
          <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>{p.name}:</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 600 }}>
            {typeof p.value === 'number' ? `${p.value.toFixed(4)} ms` : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * AlgorithmTimingChart — grouped bar chart comparing mean execution time.
 *
 * comparisonData: array of { dataset_name, dataset_size, 'Brute Force': {...}, ... }
 */
export default function AlgorithmTimingChart({ comparisonData = [], height = 320 }) {
  if (!comparisonData.length) {
    return (
      <div style={{
        height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '0.875rem',
        background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-lg)',
        border: '1px dashed var(--border-strong)',
        padding: 20,
        textAlign: 'center',
      }}>
        No benchmark data — execute a benchmark job to compare algorithm timings
      </div>
    )
  }

  // Transform for Recharts
  const chartData = comparisonData.map((d) => {
    const rawName = d.dataset_name || 'Dataset'
    return {
      name: rawName.length > 16 ? rawName.slice(0, 14) + '…' : rawName,
      fullName: rawName,
      size: d.dataset_size,
      'Brute Force':        d['Brute Force']?.mean_ms ?? null,
      'Divide & Conquer':   d['Divide & Conquer']?.mean_ms ?? null,
      "Kadane's Algorithm": d["Kadane's Algorithm"]?.mean_ms ?? null,
    }
  })

  const algos = ['Brute Force', 'Divide & Conquer', "Kadane's Algorithm"]

  return (
    <div style={{ width: '100%', height, minHeight: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }} barGap={2} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="var(--text-muted)"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={{ stroke: 'var(--border-strong)' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Number(v).toFixed(1)}ms`}
            stroke="var(--text-muted)"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={{ stroke: 'var(--border-strong)' }}
            tickLine={false}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Legend
            wrapperStyle={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
          {algos.map((algo) => (
            <Bar
              key={algo}
              dataKey={algo}
              fill={ALGO_COLORS[algo]}
              radius={[3, 3, 0, 0]}
              maxBarSize={48}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
