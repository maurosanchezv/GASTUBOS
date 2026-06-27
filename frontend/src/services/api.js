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
  
  // Evitar la página de advertencia de ngrok en la APK de prueba
  config.headers['ngrok-skip-browser-warning'] = 'true'
  
  return config
})

// Si el token expiró, redirigir a login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginEndpoint = err.config?.url?.includes('/auth/login')
    if (err.response?.status === 401 && !isLoginEndpoint) {
      localStorage.removeItem('gastubos_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
