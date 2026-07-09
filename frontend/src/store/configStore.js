// gastubos/frontend/src/store/configStore.js
import { create } from 'zustand'
import api from '../services/api.js'

export const useConfigStore = create((set, get) => ({
  nombre_empresa: 'Propio',
  direccion: '',
  telefono: '',
  loading: false,

  fetchConfig: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/config')
      set({ 
        nombre_empresa: data.nombre_empresa || 'Propio', 
        direccion: data.direccion || '', 
        telefono: data.telefono || '', 
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
        loading: false 
      })
      return { ok: true }
    } catch (err) {
      set({ loading: false })
      return { ok: false, error: err.response?.data?.error || 'Error al actualizar configuración' }
    }
  }
}))
