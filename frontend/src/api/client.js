import axios from 'axios'

/**
 * Axios instance pointing to the FastAPI backend.
 * The Vite proxy (vite.config.js) forwards /api → http://127.0.0.1:8000/api
 */
const client = axios.create({
  baseURL: '/api/v1',
  timeout: 60_000, // 60s timeout for heavier O(N²) calculations
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

// ── Response Interceptor — normalize error messages ───────────────────────
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      error.message = 'Unable to connect to backend server. Please verify the FastAPI backend is running at http://127.0.0.1:8000.'
      return Promise.reject(error)
    }

    const detail = error.response?.data?.detail
    if (detail) {
      if (Array.isArray(detail)) {
        error.message = detail.map((e) => (e && typeof e === 'object' && e.msg ? e.msg : String(e))).join(' | ')
      } else if (typeof detail === 'object') {
        error.message = JSON.stringify(detail)
      } else {
        error.message = String(detail)
      }
    }
    return Promise.reject(error)
  }
)

export default client
