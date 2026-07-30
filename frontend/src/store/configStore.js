// gastubos/frontend/src/store/configStore.js
import { create } from 'zustand'
import api from '../services/api.js'

export const useConfigStore = create((set, get) => ({
  nombre_empresa: 'Propio',
  direccion: '',
  telefono: '',
  isotipo_empresa: '',
  logo_empresa: '',
  loading: false,

  fetchPublicBranding: async () => {
    try {
      const { data } = await api.get('/config/public')
      set({
        nombre_empresa: data.nombre_empresa || 'Propio',
        isotipo_empresa: data.isotipo_empresa || '',
        logo_empresa: data.logo_empresa || '',
      })
    } catch {
      // Usar defaults
    }
  },

  fetchConfig: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/config')
      set({ 
        nombre_empresa: data.nombre_empresa || 'Propio', 
        direccion: data.direccion || '', 
        telefono: data.telefono || '', 
        isotipo_empresa: data.isotipo_empresa || '',
        logo_empresa: data.logo_empresa || '',
        loading: false 
      })
    } catch {
      set({ loading: false })
    }
  },

  updateConfig: async (payload) => {
    set({ loading: true })
    try {
      const { data } = await api.post('/config', payload)
      set({ 
        nombre_empresa: data.config.nombre_empresa || 'Propio', 
        direccion: data.config.direccion || '', 
        telefono: data.config.telefono || '', 
        isotipo_empresa: data.config.isotipo_empresa || '',
        logo_empresa: data.config.logo_empresa || '',
        loading: false 
      })
      return { ok: true }
    } catch (err) {
      set({ loading: false })
      return { ok: false, error: err.response?.data?.error || 'Error al actualizar configuración' }
    }
  }
}))
