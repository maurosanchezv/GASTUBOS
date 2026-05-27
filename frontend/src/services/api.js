// gastubos/frontend/src/services/api.js
// Cliente axios centralizado. El token JWT se inyecta automáticamente.

import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
})

// Inyectar token en cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gastubos_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Si el token expiró, redirigir a login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('gastubos_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
