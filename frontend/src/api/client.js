import axios from 'axios'

/**
 * Axios instance pointing to the FastAPI backend.
 * The Vite proxy (vite.config.js) forwards /api → http://localhost:8000/api
 * so this works for both dev and production builds.
 */
const client = axios.create({
  baseURL: '/api/v1',
  timeout: 60_000, // 60s — generous for O(N²) benchmarks
  headers: { 'Content-Type': 'application/json' },
})

// ── Response Interceptor — normalize error messages ───────────────────────
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error.response?.data?.detail
    if (detail) {
      error.message = Array.isArray(detail)
        ? detail.map((e) => e.msg).join(' | ')
        : String(detail)
    }
    return Promise.reject(error)
  }
)

export default client
