/**
 * Report API — Phase 5
 *
 * Wraps /api/v1/report endpoints:
 *   - listReportableDatasets()       → GET /report/datasets
 *   - downloadReport(datasetId)      → GET /report/dataset/{id}  (triggers download)
 *   - getReportUrl(datasetId)        → Returns the raw URL (for <a> links)
 */

import client from './client'

/**
 * List all datasets that have at least one analysis or benchmark result.
 * Each item includes `has_analysis`, `has_benchmark`, `has_complexity` flags.
 */
export async function listReportableDatasets() {
  const { data } = await client.get('/report/datasets')
  return data
}

/**
 * Programmatically trigger a PDF download for a dataset.
 * Uses axios blob response + creates a temporary <a> element.
 *
 * @param {number} datasetId
 * @param {string} filename  - Optional custom filename
 */
export async function downloadReport(datasetId, filename) {
  const { data, headers } = await client.get(
    `/report/dataset/${datasetId}`,
    { responseType: 'blob' }
  )

  const contentDisp = headers['content-disposition'] ?? ''
  const serverName  = contentDisp.match(/filename="?([^"]+)"?/)?.[1]
  const finalName   = filename ?? serverName ?? `report_dataset_${datasetId}.pdf`

  const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
  const a   = document.createElement('a')
  a.href     = url
  a.download = finalName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Return the raw PDF URL (for inline preview or manual linking).
 * @param {number} datasetId
 */
export function getReportUrl(datasetId) {
  return `/api/v1/report/dataset/${datasetId}`
}
