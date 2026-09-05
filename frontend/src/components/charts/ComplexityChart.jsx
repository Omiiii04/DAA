import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend
} from 'recharts'

const ALGO_COLORS = {
  'Brute Force':        'var(--algo-bf)',
  'Divide & Conquer':   'var(--algo-dc)',
  "Kadane's Algorithm": 'var(--algo-kadane)',
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
        <div key={p.dataKey} style={{ color: p.color, fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', margin: '2px 0' }}>
          {p.name}: {typeof p.value === 'number' ? `${p.value.toFixed(4)}x` : '—'}
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
        background: 'var(--surface)', borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-inset)',
        border: '1px dashed var(--divider-strong)',
        padding: 24,
      }}>
        <div>
          <div style={{ fontSize: '1.75rem', marginBottom: 8 }}>📊</div>
          <div>Benchmark at least 2 datasets of <strong>different sizes</strong> to render empirical complexity curves.</div>
        </div>
      </div>
    )
  }

  // Merge all data points into a single array keyed by dataset_size
  const sizeMap = {}
  for (const [name, data] of Object.entries(analyses)) {
    if (!data?.points) continue
    for (const p of data.points) {
      if (!sizeMap[p.dataset_size]) sizeMap[p.dataset_size] = { n: p.dataset_size }
      sizeMap[p.dataset_size][`${name}_obs`]   = p.normalized_observed
      sizeMap[p.dataset_size][`${name}_theory`] = p.theoretical_value
    }
  }
  const chartData = Object.values(sizeMap).sort((a, b) => a.n - b.n)

  return (
    <div>
      {/* Fitness Score Cards (Neumorphic Chrome) */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {algoNames.map((name) => {
          const a = analyses[name]
          const fitness = typeof a?.fitness_score === 'number' ? a.fitness_score : null
          const color = ALGO_COLORS[name] ?? 'var(--accent)'
          return (
            <div key={name} style={{
              background: 'var(--surface)',
              border: `1px solid var(--card-border)`,
              borderLeft: `4px solid ${color}`,
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-raised-sm)',
              padding: '12px 16px',
              minWidth: 170,
              flex: '1 1 180px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 700 }}>{name}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {a?.complexity}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.2rem',
                fontWeight: 800,
                color: fitness == null ? 'var(--text-muted)' : fitness >= 0.9 ? 'var(--success)' : fitness >= 0.7 ? 'var(--warning)' : 'var(--danger)',
                margin: '3px 0',
              }}>
                {fitness != null ? `Fit: ${(fitness * 100).toFixed(1)}%` : 'Fit: —'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Obs: {a?.mean_growth_ratio != null ? `${a.mean_growth_ratio.toFixed(2)}x` : '—'} vs Theory: {a?.theoretical_mean != null ? `${a.theoretical_mean.toFixed(2)}x` : '—'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Flat Reading Surface for Accurate Curve Comparison */}
      <div className="reading-surface" style={{ padding: '16px 12px 12px', borderRadius: 'var(--radius-sm)' }}>
        <div style={{ width: '100%', height, minHeight: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="n"
                type="number"
                scale="log"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                stroke="var(--chart-axis)"
                tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                axisLine={{ stroke: 'var(--divider-strong)' }}
                tickLine={false}
                label={{ value: 'Dataset Size (N)', position: 'insideBottom', offset: -6, fill: 'var(--chart-axis)', fontSize: 11 }}
              />
              <YAxis
                scale="log"
                domain={['auto', 'auto']}
                tickFormatter={(v) => `${Number(v).toFixed(1)}x`}
                stroke="var(--chart-axis)"
                tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                axisLine={{ stroke: 'var(--divider-strong)' }}
                tickLine={false}
                width={52}
                label={{ value: 'Normalized Growth', angle: -90, position: 'insideLeft', fill: 'var(--chart-axis)', fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-secondary)', paddingTop: 10 }}
                iconType="line"
              />

              {/* Flatmap avoids React Fragment missing key warnings in Recharts */}
              {algoNames.flatMap((name) => [
                <Line
                  key={`${name}_obs`}
                  dataKey={`${name}_obs`}
                  name={`${name} (observed)`}
                  stroke={ALGO_COLORS[name] ?? 'var(--text-muted)'}
                  strokeWidth={2.2}
                  dot={{ r: 4, fill: ALGO_COLORS[name] ?? 'var(--text-muted)' }}
                  connectNulls
                  isAnimationActive={false}
                />,
                <Line
                  key={`${name}_theory`}
                  dataKey={`${name}_theory`}
                  name={`${name} (theoretical)`}
                  stroke={ALGO_COLORS[name] ?? 'var(--text-muted)'}
                  strokeWidth={1.75}
                  strokeDasharray={THEORETICAL_DASHES[name] ?? '5 5'}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                  opacity={0.65}
                />,
              ])}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>— Solid: Observed timings (normalized to first point)</span>
        <span>- - Dashed: Theoretical Big-O curves</span>
        <span>Both axes: logarithmic scale</span>
      </div>
    </div>
  )
}
