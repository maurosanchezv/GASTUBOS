// gastubos/frontend/src/store/authStore.js
import { create } from 'zustand'
import api from '../services/api.js'

export const useAuthStore = create((set, get) => ({
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

  updateProfile: async (payload) => {
    try {
      const { data } = await api.patch('/auth/me', payload)
      set({ user: data })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.response?.data?.error || 'Error al actualizar perfil' }
    }
  },
}))
