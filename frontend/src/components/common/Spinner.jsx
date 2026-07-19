/** Spinning loader with optional label */
export default function Spinner({ size = 24, label = null, center = false }) {
  const el = (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      color: 'var(--text-muted)',
      fontSize: '0.875rem',
    }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: 'spin 0.75s linear infinite', flexShrink: 0 }}
      >
        <circle cx="12" cy="12" r="10" stroke="var(--border-strong)" strokeWidth="2.5" />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {label && <span>{label}</span>}
    </div>
  )

  if (center) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px 0' }}>
        {el}
      </div>
    )
  }
  return el
}
