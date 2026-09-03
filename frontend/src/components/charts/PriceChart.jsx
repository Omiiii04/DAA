import { useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceArea, ReferenceLine
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
      <div style={{ marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        Index: {typeof label === 'number' ? label.toLocaleString() : label}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
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
 *   height     — chart height in px (default 420)
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
        background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-lg)',
        border: '1px dashed var(--border-strong)',
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
          <span style={{ color: 'var(--info)', fontWeight: 600 }}>LTTB Downsampled:</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Displaying {priceData.returned_size?.toLocaleString()} visual points from {priceData.original_size?.toLocaleString()} total. Exact peaks and troughs preserved.
          </span>
        </div>
      )}

      <div style={{ width: '100%', height, minHeight: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
              stroke="var(--text-muted)"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={{ stroke: 'var(--border-strong)' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
              stroke="var(--text-muted)"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={{ stroke: 'var(--border-strong)' }}
              tickLine={false}
              width={56}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Profit window highlight */}
            {highlightResult && (
              <ReferenceArea
                x1={highlightResult.buy_index}
                x2={highlightResult.sell_index}
                fill="rgba(16,185,129,0.08)"
                stroke="rgba(16,185,129,0.3)"
                strokeDasharray="4 4"
                label={{ value: 'Optimal Profit Window', fill: '#10b981', fontSize: 11, position: 'insideTop' }}
              />
            )}

            {/* Buy/Sell lines */}
            {highlightResult && (
              <>
                <ReferenceLine
                  x={highlightResult.buy_index}
                  stroke="#10b981"
                  strokeDasharray="5 3"
                  label={{
                    value: `Buy $${highlightResult.buy_price != null ? highlightResult.buy_price.toFixed(2) : ''}`,
                    fill: '#10b981', fontSize: 10, position: 'top'
                  }}
                />
                <ReferenceLine
                  x={highlightResult.sell_index}
                  stroke="#ef4444"
                  strokeDasharray="5 3"
                  label={{
                    value: `Sell $${highlightResult.sell_price != null ? highlightResult.sell_price.toFixed(2) : ''}`,
                    fill: '#ef4444', fontSize: 10, position: 'top'
                  }}
                />
              </>
            )}

            <Line
              type="monotone"
              dataKey="price"
              stroke="var(--primary)"
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 4, fill: 'var(--primary)', stroke: '#ffffff', strokeWidth: 2 }}
              isAnimationActive={chartData.length < 2000}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Algorithm result summary cards */}
      {results && Object.keys(results).length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          {Object.entries(results).map(([name, r]) => {
            const color = ALGO_COLORS[name] ?? 'var(--primary)'
            return (
              <div key={name} style={{
                background: 'var(--bg-surface-2)',
                border: `1px solid var(--border)`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 'var(--radius)',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flex: '1 1 180px',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: color,
                }} />
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{name}</div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
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
