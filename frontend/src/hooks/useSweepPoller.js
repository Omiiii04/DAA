/**
 * useSweepPoller — real-time polling hook for complexity sweep jobs.
 *
 * Polls GET /complexity/sweep/{jobId} every `intervalMs` milliseconds.
 * Stops polling automatically when status is 'completed' or 'failed'.
 * Cleans up the interval on component unmount.
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
  const timerRef = useRef(null)

  useEffect(() => {
    if (!jobId) {
      setJob(null)
      setError(null)
      return
    }

    // Poll immediately, then on interval
    const poll = async () => {
      try {
        const data = await getSweepStatus(jobId)
        setJob(data)
        setError(null)
        if (TERMINAL_STATUSES.has(data.status)) {
          clearInterval(timerRef.current)
        }
      } catch (err) {
        setError(err.message ?? 'Poll error')
      }
    }

    poll()
    timerRef.current = setInterval(poll, intervalMs)

    return () => clearInterval(timerRef.current)
  }, [jobId, intervalMs])

  return { job, error }
}
