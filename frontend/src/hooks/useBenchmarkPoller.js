import { useCallback, useEffect, useRef, useState } from 'react'
import { getBenchmarkStatus } from '../api/benchmark'

/**
 * Polls GET /benchmark/{jobId} every `intervalMs` until status is
 * 'completed' or 'failed'. Clears the interval automatically on cleanup.
 */
export function useBenchmarkPoller(jobId, intervalMs = 2000) {
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!jobId) { setJob(null); return }

    const poll = async () => {
      try {
        const data = await getBenchmarkStatus(jobId)
        setJob(data)
        if (data.status === 'completed' || data.status === 'failed') {
          stop()
        }
      } catch (err) {
        setError(err.message)
        stop()
      }
    }

    poll() // immediate first call
    intervalRef.current = setInterval(poll, intervalMs)
    return stop
  }, [jobId, intervalMs, stop])

  return { job, error, stop }
}
