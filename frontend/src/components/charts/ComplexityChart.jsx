import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine
} from 'recharts'

const ALGO_COLORS = {
  'Brute Force':        '#ef4444',
  'Divide & Conquer':   '#f59e0b',
  "Kadane's Algorithm": '#10b981',
}

const THEORETICAL_DASHES = {
  'Brute Force':        '0',
  'Divide & Conquer':   '8 4',
  "Kadane's Algorithm": '4 4',
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div style={{ marginBottom: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        N = {Number(label).toLocaleString()}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>
          {p.name}: {p.value?.toFixed(4)}x
        </div>
      ))}
    </div>
  )
}

/**
 * ComplexityChart — log-log normalized growth curve chart.
 *
 * analyses: { [algoName]: { complexity, color, points: [{ dataset_size, normalized_observed, theoretical_value }] } }
 */
export default function ComplexityChart({ analyses = {}, height = 400 }) {
  const algoNames = Object.keys(analyses)

  if (!algoNames.length) {
    return (
      <div style={{
        height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center',
        background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-lg)',
        border: '1px dashed var(--border-strong)',
        padding: 24,
      }}>
        <div>
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📊</div>
          <div>Benchmark at least 2 datasets of <strong>different sizes</strong> to see complexity curves.</div>
        </div>
      </div>
    )
  }

  // Merge all data points into a single array keyed by dataset_size
  const sizeMap = {}
  for (const [name, data] of Object.entries(analyses)) {
    for (const p of data.points) {
      if (!sizeMap[p.dataset_size]) sizeMap[p.dataset_size] = { n: p.dataset_size }
      sizeMap[p.dataset_size][`${name}_obs`]   = p.normalized_observed
      sizeMap[p.dataset_size][`${name}_theory`] = p.theoretical_value
    }
  }
  const chartData = Object.values(sizeMap).sort((a, b) => a.n - b.n)

  return (
    <div>
      {/* Fitness Score Pills */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {algoNames.map((name) => {
          const a = analyses[name]
          const fitness = a.fitness_score
          const good = fitness >= 0.8
          return (
            <div key={name} style={{
              background: 'var(--bg-surface-2)',
              border: `1px solid ${ALGO_COLORS[name]}30`,
              borderRadius: 'var(--radius)',
              padding: '8px 16px',
              minWidth: 160,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ALGO_COLORS[name] }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{name}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{a.complexity}</div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1rem',
                fontWeight: 700,
                color: fitness >= 0.9 ? 'var(--success)' : fitness >= 0.7 ? 'var(--warning)' : 'var(--danger)',
              }}>
                Fit: {(fitness * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Obs: {a.mean_growth_ratio?.toFixed(2)}x vs Theory: {a.theoretical_mean?.toFixed(2)}x
              </div>
            </div>
          )
        })}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="n"
            type="number"
            scale="log"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
            stroke="var(--text-muted)"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={{ stroke: 'var(--border-strong)' }}
            tickLine={false}
            label={{ value: 'Dataset Size (N)', position: 'insideBottom', offset: -4, fill: 'var(--text-muted)', fontSize: 11 }}
          />
          <YAxis
            scale="log"
            domain={['auto', 'auto']}
            tickFormatter={(v) => `${v.toFixed(1)}x`}
            stroke="var(--text-muted)"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={{ stroke: 'var(--border-strong)' }}
            tickLine={false}
            width={52}
            label={{ value: 'Normalized Growth', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}
            iconType="line"
          />

          {algoNames.map((name) => (
            <>
              {/* Observed (solid) */}
              <Line
                key={`${name}_obs`}
                dataKey={`${name}_obs`}
                name={`${name} (observed)`}
                stroke={ALGO_COLORS[name]}
                strokeWidth={2}
                dot={{ r: 4, fill: ALGO_COLORS[name] }}
                connectNulls
                isAnimationActive={false}
              />
              {/* Theoretical (dashed) */}
              <Line
                key={`${name}_theory`}
                dataKey={`${name}_theory`}
                name={`${name} (theoretical)`}
                stroke={ALGO_COLORS[name]}
                strokeWidth={1.5}
                strokeDasharray={THEORETICAL_DASHES[name] ?? '5 5'}
                dot={false}
                connectNulls
                isAnimationActive={false}
                opacity={0.45}
              />
            </>
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
        <span>— Solid: Observed timings (normalized to first point)</span>
        <span>- - Dashed: Theoretical {'{'}O(N), O(N log N), O(N²){'}'} curves</span>
        <span>Both axes: log scale</span>
      </div>
    </div>
  )
}
