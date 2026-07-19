/**
 * ML API Client — Phase 6
 *
 * Wraps /api/v1/ml endpoints:
 *   listModels()          → GET  /ml/models
 *   startTraining(req)    → POST /ml/train
 *   getJob(jobId)         → GET  /ml/job/{id}
 *   listJobs(limit)       → GET  /ml/jobs
 *   runPredict(jobId,req) → POST /ml/predict/{id}
 *   deleteJob(jobId)      → DELETE /ml/job/{id}
 */

import client from './client'

/** List all registered ML models with hyperparameter definitions. */
export async function listModels() {
  const { data } = await client.get('/ml/models')
  return data  // { models: [...], total: N }
}

/**
 * Start a training job.
 * @param {{ dataset_id: number, model_name: string, hyperparams: Object }} req
 */
export async function startTraining(req) {
  const { data } = await client.post('/ml/train', req)
  return data  // { job_id, model_name, dataset_id, status, poll_url }
}

/** Poll one training job by ID. */
export async function getJob(jobId) {
  const { data } = await client.get(`/ml/job/${jobId}`)
  return data
}

/** List all training jobs (newest first). */
export async function listJobs(limit = 50) {
  const { data } = await client.get('/ml/jobs', { params: { limit } })
  return data  // { total, jobs: [...] }
}

/**
 * Run inference on a dataset using a trained job.
 * @param {number} jobId
 * @param {{ dataset_id: number }} req
 */
export async function runPredict(jobId, req) {
  const { data } = await client.post(`/ml/predict/${jobId}`, req)
  return data
}

/** Delete a training job and its artifact from disk. */
export async function deleteJob(jobId) {
  const { data } = await client.delete(`/ml/job/${jobId}`)
  return data
}
