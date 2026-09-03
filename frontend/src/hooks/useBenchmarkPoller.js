import { useCallback, useEffect, useRef, useState } from 'react'
import { getBenchmarkStatus } from '../api/benchmark'

/**
 * Polls GET /benchmark/{jobId} every `intervalMs` until status is
 * 'completed' or 'failed'. Clears interval and guards unmount automatically.
 */
export function useBenchmarkPoller(jobId, intervalMs = 2000) {
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)
  const mountedRef  = useRef(true)

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    if (!jobId) {
      setJob(null)
      setError(null)
      return () => { mountedRef.current = false }
    }

    const poll = async () => {
      try {
        const data = await getBenchmarkStatus(jobId)
        if (!mountedRef.current) return
        setJob(data)
        if (data.status === 'completed' || data.status === 'failed') {
          stop()
        }
      } catch (err) {
        if (!mountedRef.current) return
        setError(err.response?.data?.detail ?? err.message ?? 'Benchmark polling error.')
        stop()
      }
    }

    poll() // immediate first poll
    intervalRef.current = setInterval(poll, intervalMs)

    return () => {
      mountedRef.current = false
      stop()
    }
  }, [jobId, intervalMs, stop])

  return { job, error, stop }
}
