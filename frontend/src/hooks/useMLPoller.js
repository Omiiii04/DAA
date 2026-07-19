/**
 * useMLPoller — Phase 6
 *
 * Polls GET /ml/job/{jobId} every `interval` ms until the job reaches
 * a terminal state (completed | failed).
 *
 * Returns:
 *   { job, polling, error }
 *
 * Usage:
 *   const { job, polling } = useMLPoller(jobId, { onComplete, onFail })
 *
 * The hook automatically clears its interval when:
 *   - job.status === 'completed' or 'failed'
 *   - the component unmounts
 *   - jobId becomes null/undefined
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { getJob } from '../api/ml'

const TERMINAL = new Set(['completed', 'failed'])

/**
 * @param {number|null}   jobId     - Job ID to poll (null = no polling)
 * @param {Object}        opts
 * @param {Function}      [opts.onComplete] - Called with final job when completed
 * @param {Function}      [opts.onFail]     - Called with final job when failed
 * @param {number}        [opts.interval]   - Poll interval in ms (default 2000)
 */
export function useMLPoller(jobId, opts = {}) {
  const { onComplete, onFail, interval = 2000 } = opts

  const [job,     setJob]     = useState(null)
  const [polling, setPolling] = useState(false)
  const [error,   setError]   = useState(null)

  const timerRef   = useRef(null)
  const mountedRef = useRef(true)

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setPolling(false)
  }, [])

  const poll = useCallback(async () => {
    if (!jobId) return
    try {
      const data = await getJob(jobId)
      if (!mountedRef.current) return

      setJob(data)
      setError(null)

      if (TERMINAL.has(data.status)) {
        stopPolling()
        if (data.status === 'completed') onComplete?.(data)
        else                             onFail?.(data)
      }
    } catch (err) {
      if (!mountedRef.current) return
      setError(err.response?.data?.detail ?? err.message)
    }
  }, [jobId, onComplete, onFail, stopPolling])

  useEffect(() => {
    mountedRef.current = true
    if (!jobId) {
      stopPolling()
      setJob(null)
      setError(null)
      return
    }

    // Initial immediate poll
    setPolling(true)
    poll()

    // Recurring interval
    timerRef.current = setInterval(poll, interval)

    return () => {
      mountedRef.current = false
      stopPolling()
    }
  }, [jobId, interval, poll, stopPolling])

  return { job, polling, error }
}
