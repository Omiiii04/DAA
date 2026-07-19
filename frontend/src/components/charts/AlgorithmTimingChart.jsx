import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell
} from 'recharts'

const ALGO_COLORS = {
  'Brute Force':        '#ef4444',
  'Divide & Conquer':   '#f59e0b',
  "Kadane's Algorithm": '#10b981',
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8125rem' }}>
        {label}
      </div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, color: p.fill }}>
          <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>{p.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>{p.value?.toFixed(4)} ms</span>
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
export default function AlgorithmTimingChart({ comparisonData = [], height = 340 }) {
  if (!comparisonData.length) {
    return (
      <div style={{
        height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '0.875rem',
        background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-lg)',
        border: '1px dashed var(--border-strong)',
      }}>
        No benchmark data — run a benchmark to see timing comparison
      </div>
    )
  }

  // Transform for Recharts (one bar per algorithm)
  const chartData = comparisonData.map((d) => ({
    name: d.dataset_name.length > 16 ? d.dataset_name.slice(0, 14) + '…' : d.dataset_name,
    fullName: d.dataset_name,
    size: d.dataset_size,
    'Brute Force':        d['Brute Force']?.mean_ms ?? null,
    'Divide & Conquer':   d['Divide & Conquer']?.mean_ms ?? null,
    "Kadane's Algorithm": d["Kadane's Algorithm"]?.mean_ms ?? null,
  }))

  const algos = ['Brute Force', 'Divide & Conquer', "Kadane's Algorithm"]

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 8 }} barGap={3} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="name"
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={{ stroke: 'var(--border-strong)' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v.toFixed(1)}ms`}
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={{ stroke: 'var(--border-strong)' }}
          tickLine={false}
          width={55}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Legend
          wrapperStyle={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}
          iconType="circle"
          iconSize={8}
        />
        {algos.map((algo) => (
          <Bar key={algo} dataKey={algo} fill={ALGO_COLORS[algo]} radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={ALGO_COLORS[algo]} fillOpacity={0.85} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
