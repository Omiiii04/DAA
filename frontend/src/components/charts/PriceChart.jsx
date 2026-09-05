import { useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceArea, ReferenceLine
} from 'recharts'

const ALGO_COLORS = {
  'Brute Force':        'var(--algo-bf)',
  'Divide & Conquer':   'var(--algo-dc)',
  "Kadane's Algorithm": 'var(--algo-kadane)',
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div style={{ marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        Index: {typeof label === 'number' ? label.toLocaleString() : label}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 600 }}>
          {typeof p.value === 'number' ? `$${p.value.toFixed(2)}` : '—'}
        </div>
      ))}
    </div>
  )
}

/**
 * PriceChart — Recharts LineChart for LTTB-downsampled price data.
 *
 * Props:
 *   priceData  — { prices, indices, is_downsampled, original_size, returned_size }
 *   results    — dict of { algorithm_name: SubarrayResultSchema }
 *   height     — chart height in px (default 400)
 */
export default function PriceChart({ priceData, results, height = 400 }) {
  const chartData = useMemo(() => {
    if (!priceData?.prices || !priceData?.indices) return []
    return priceData.prices.map((price, i) => ({
      x: priceData.indices[i],
      price: typeof price === 'number' ? Number(price.toFixed(4)) : 0,
    }))
  }, [priceData])

  if (!priceData || !chartData.length) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '0.875rem',
        background: 'var(--surface)', borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-inset)',
        border: '1px dashed var(--divider-strong)',
        padding: 20,
        textAlign: 'center',
      }}>
        No price data — select a dataset to visualize price history and algorithm solution
      </div>
    )
  }

  // Determine a single profit window to highlight
  // Priority: Kadane > D&C > BF
  const priorityOrder = ["Kadane's Algorithm", 'Divide & Conquer', 'Brute Force']
  const highlightResult = results
    ? priorityOrder.map((n) => results[n]).find((r) => r && r.buy_index != null && r.sell_index != null)
    : null

  return (
    <div>
      {/* LTTB Info Banner */}
      {priceData.is_downsampled && (
        <div className="panel panel-info" style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.78rem' }}>
          <span style={{ color: 'var(--info)', fontWeight: 700 }}>LTTB Downsampled:</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Displaying {priceData.returned_size?.toLocaleString()} visual points from {priceData.original_size?.toLocaleString()} total. Exact peaks and troughs preserved.
          </span>
        </div>
      )}

      {/* Flat Reading Surface for Financial Chart Legibility */}
      <div className="reading-surface" style={{ padding: '16px 12px 12px', borderRadius: 'var(--radius-sm)' }}>
        <div style={{ width: '100%', height, minHeight: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="x"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                stroke="var(--chart-axis)"
                tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                axisLine={{ stroke: 'var(--divider-strong)' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                stroke="var(--chart-axis)"
                tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                axisLine={{ stroke: 'var(--divider-strong)' }}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Profit window highlight */}
              {highlightResult && (
                <ReferenceArea
                  x1={highlightResult.buy_index}
                  x2={highlightResult.sell_index}
                  fill="var(--success-dim)"
                  stroke="var(--algo-kadane)"
                  strokeDasharray="4 4"
                  label={{ value: 'Optimal Profit Window', fill: 'var(--algo-kadane)', fontSize: 11, position: 'insideTop', fontWeight: 600 }}
                />
              )}

              {/* Buy/Sell lines */}
              {highlightResult && (
                <>
                  <ReferenceLine
                    x={highlightResult.buy_index}
                    stroke="var(--algo-kadane)"
                    strokeDasharray="5 3"
                    label={{
                      value: `Buy $${highlightResult.buy_price != null ? highlightResult.buy_price.toFixed(2) : ''}`,
                      fill: 'var(--algo-kadane)', fontSize: 11, position: 'top', fontWeight: 700
                    }}
                  />
                  <ReferenceLine
                    x={highlightResult.sell_index}
                    stroke="var(--algo-bf)"
                    strokeDasharray="5 3"
                    label={{
                      value: `Sell $${highlightResult.sell_price != null ? highlightResult.sell_price.toFixed(2) : ''}`,
                      fill: 'var(--algo-bf)', fontSize: 11, position: 'top', fontWeight: 700
                    }}
                  />
                </>
              )}

              <Line
                type="monotone"
                dataKey="price"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--surface-flat)', strokeWidth: 2 }}
                isAnimationActive={chartData.length < 2000}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Algorithm result summary cards */}
      {results && Object.keys(results).length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--divider)' }}>
          {Object.entries(results).map(([name, r]) => {
            const color = ALGO_COLORS[name] ?? 'var(--accent)'
            return (
              <div key={name} style={{
                background: 'var(--surface)',
                border: `1px solid var(--card-border)`,
                borderLeft: `4px solid ${color}`,
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-raised-sm)',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flex: '1 1 200px',
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: color, flexShrink: 0,
                }} />
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{name}</div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '1rem',
                    fontWeight: 800,
                    color,
                  }}>
                    +${typeof r?.max_profit === 'number' ? r.max_profit.toFixed(4) : '0.0000'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
