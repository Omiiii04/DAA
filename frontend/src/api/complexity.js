/**
 * Complexity Sweep API — Phase 4
 *
 * Wraps all /api/v1/complexity endpoints:
 *   - startSweep(request)         → POST /sweep
 *   - getSweepStatus(jobId)       → GET  /sweep/{job_id}
 *   - listSweeps()                → GET  /sweeps
 *   - getSweepConfig()            → GET  /config
 */

import client from './client'

/**
 * Launch a complexity sweep.
 *
 * @param {object} payload
 * @param {number[]} payload.sizes           - Dataset sizes to benchmark
 * @param {string[]} payload.algorithms      - Algorithm names
 * @param {string}   payload.distribution_type
 * @param {number|null} payload.seed
 */
export async function startSweep(payload) {
  const { data } = await client.post('/complexity/sweep', payload)
  return data
}

/**
 * Poll a sweep job by ID.
 * @param {string} jobId
 */
export async function getSweepStatus(jobId) {
  const { data } = await client.get(`/complexity/sweep/${jobId}`)
  return data
}

/**
 * List all in-memory sweep jobs.
 */
export async function listSweeps() {
  const { data } = await client.get('/complexity/sweeps')
  return data
}

/**
 * Get static configuration options (sizes, algorithms, distributions).
 */
export async function getSweepConfig() {
  const { data } = await client.get('/complexity/config')
  return data
}
