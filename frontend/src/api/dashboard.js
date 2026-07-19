import client from './client'

export const getDashboardSummary  = () =>
  client.get('/dashboard/summary').then((r) => r.data)

export const getDashboardComparison = () =>
  client.get('/dashboard/comparison').then((r) => r.data)

export const getDashboardComplexity = () =>
  client.get('/dashboard/complexity').then((r) => r.data)
