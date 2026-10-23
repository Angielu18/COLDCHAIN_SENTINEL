const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const getToken = () => localStorage.getItem('coldchain_token')

async function request(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const baseHeaders = body !== undefined ? { 'Content-Type': 'application/json' } : {}
  const authHeaders = auth && getToken() ? { Authorization: `Bearer ${getToken()}` } : {}
  const init = {
    method,
    headers: { ...baseHeaders, ...authHeaders, ...headers }
  }
  if (body !== undefined) init.body = JSON.stringify(body)

  const res = await fetch(`${API_URL}${path}`, init)

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(data.error || `Error HTTP ${res.status}`)
    error.status = res.status
    throw error
  }
  return data
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body })
}

export const apiUrl = (path) => `${API_URL}${path}`
export const authQuery = () => `token=${encodeURIComponent(getToken() || '')}`

