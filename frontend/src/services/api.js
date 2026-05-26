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

// ─────────────────────────────────────────────────────────────────────────────
// gastubos/frontend/src/store/authStore.js
// Estado global de autenticación con Zustand

import { create } from 'zustand'
import api from '../services/api.js'

export const useAuthStore = create((set) => ({
  user:    null,
  token:   localStorage.getItem('gastubos_token') || null,
  loading: false,

  login: async (username, password) => {
    set({ loading: true })
    try {
      const { data } = await api.post('/auth/login', { username, password })
      localStorage.setItem('gastubos_token', data.token)
      set({ user: data.user, token: data.token, loading: false })
      return { ok: true }
    } catch (err) {
      set({ loading: false })
      return { ok: false, error: err.response?.data?.error || 'Error de conexión' }
    }
  },

  logout: () => {
    localStorage.removeItem('gastubos_token')
    set({ user: null, token: null })
  },

  fetchMe: async () => {
    try {
      const { data } = await api.get('/auth/me')
      set({ user: data })
    } catch {
      localStorage.removeItem('gastubos_token')
      set({ user: null, token: null })
    }
  },
}))
