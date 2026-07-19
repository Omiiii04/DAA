import client from './client'

/** Start a benchmark job (async — returns job_id immediately) */
export const startBenchmark = (datasetId, algorithms = null) =>
  client.post('/benchmark', { dataset_id: datasetId, algorithms }).then((r) => r.data)

/** Poll job status */
export const getBenchmarkStatus = (jobId) =>
  client.get(`/benchmark/${jobId}`).then((r) => r.data)

/** List all benchmark jobs */
export const listBenchmarkJobs = () =>
  client.get('/benchmark').then((r) => r.data)

/** Get algorithm info (complexity, limits) */
export const getAlgorithmInfo = () =>
  client.get('/benchmark/algorithms/info').then((r) => r.data)
