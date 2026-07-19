import client from './client'

/** List datasets (paginated) */
export const listDatasets = (page = 1, pageSize = 20) =>
  client.get('/datasets', { params: { page, page_size: pageSize } })
    .then((r) => r.data)

/** Get dataset detail (with analysis_runs) */
export const getDataset = (id) =>
  client.get(`/datasets/${id}`).then((r) => r.data)

/** Get LTTB price array for a dataset */
export const getDatasetPrices = (id) =>
  client.get(`/datasets/${id}/prices`).then((r) => r.data)

/** Generate a synthetic dataset */
export const generateDataset = (payload) =>
  client.post('/datasets/generate', payload).then((r) => r.data)

/** Upload CSV/XLSX (multipart/form-data) */
export const uploadDataset = (name, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return client.post(`/datasets/upload?name=${encodeURIComponent(name)}`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

/** Validate CSV/XLSX without saving */
export const validateDataset = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return client.post('/datasets/validate', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

/** Delete a dataset */
export const deleteDataset = (id) =>
  client.delete(`/datasets/${id}`).then((r) => r.data)
