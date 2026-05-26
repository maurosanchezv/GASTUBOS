// gastubos/frontend/src/hooks/useApi.js
// Hook genérico para fetch con loading/error
import { useState, useEffect, useCallback } from 'react'
import api from '../services/api.js'

export function useApi(endpoint, deps = []) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(endpoint)
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  useEffect(() => { fetch() }, [fetch, ...deps])

  return { data, loading, error, refetch: fetch }
}
