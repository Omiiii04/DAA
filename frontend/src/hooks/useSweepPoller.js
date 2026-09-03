/**
 * useSweepPoller — real-time polling hook for complexity sweep jobs.
 *
 * Polls GET /complexity/sweep/{jobId} every `intervalMs` milliseconds.
 * Stops polling automatically when status is 'completed' or 'failed'.
 * Cleans up the interval and guards against unmounted component state updates.
 *
 * @param {string|null}  jobId       - Sweep job ID to poll (null = inactive)
 * @param {number}       intervalMs  - Polling interval in ms (default 2000)
 *
 * @returns {{ job: object|null, error: string|null }}
 */

import { useState, useEffect, useRef } from 'react'
import { getSweepStatus } from '../api/complexity'

const TERMINAL_STATUSES = new Set(['completed', 'failed'])

export function useSweepPoller(jobId, intervalMs = 2000) {
  const [job,   setJob]   = useState(null)
  const [error, setError] = useState(null)
  const timerRef   = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (!jobId) {
      setJob(null)
      setError(null)
      return () => { mountedRef.current = false }
    }

    const poll = async () => {
      try {
        const data = await getSweepStatus(jobId)
        if (!mountedRef.current) return
        setJob(data)
        setError(null)
        if (TERMINAL_STATUSES.has(data.status)) {
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
        }
      } catch (err) {
        if (!mountedRef.current) return
        setError(err.response?.data?.detail ?? err.message ?? 'Sweep polling error.')
      }
    }

    poll()
    timerRef.current = setInterval(poll, intervalMs)

    return () => {
      mountedRef.current = false
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [jobId, intervalMs])

  return { job, error }
}
