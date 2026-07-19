import client from './client'

/**
 * Run algorithm analysis (synchronous — may take seconds for BF on large N).
 * @param {object} params — { dataset_id?, prices?, algorithms? }
 */
export const runAnalysis = (params) =>
  client.post('/analyze', params).then((r) => r.data)
