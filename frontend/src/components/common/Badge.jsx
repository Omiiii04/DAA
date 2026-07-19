/**
 * Complexity badge for algorithm time complexity strings.
 * Maps O(N²) → red, O(N log N) → amber, O(N) → green.
 */
const COMPLEXITY_STYLE = {
  'O(N²)':       'badge badge-bf',
  'O(N log N)':  'badge badge-dc',
  'O(N)':        'badge badge-kadane',
}

export function ComplexityBadge({ complexity }) {
  return (
    <span className={COMPLEXITY_STYLE[complexity] ?? 'badge badge-muted'}>
      {complexity}
    </span>
  )
}

/** Generic colored badge */
export function Badge({ children, variant = 'muted' }) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}

/** Source badge: generated vs uploaded */
export function SourceBadge({ source }) {
  return (
    <span className={`badge badge-${source === 'generated' ? 'info' : 'success'}`}>
      {source}
    </span>
  )
}

/** Verification badge */
export function VerifiedBadge({ verified }) {
  return verified
    ? <span className="badge badge-success">✓ Verified</span>
    : <span className="badge badge-muted">Unverified</span>
}

/** Job status badge */
export function StatusBadge({ status }) {
  const map = {
    queued:    ['muted',   'Queued'],
    running:   ['warning', 'Running'],
    completed: ['success', 'Completed'],
    failed:    ['danger',  'Failed'],
  }
  const [variant, label] = map[status] ?? ['muted', status]
  return <span className={`badge badge-${variant}`}>{label}</span>
}
