import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useConfigStore } from '../store/configStore.js'
import { getBrandingSources } from '../utils/logosSvg.js'

export default function LoginPage() {
  const [form, setForm]     = useState({ username: '', password: '' })
  const [verPassword, setVerPassword] = useState(false)
  const [error, setError]   = useState('')
  const { login, loading }  = useAuthStore()
  const { nombre_empresa, isotipo_empresa, logo_empresa, fetchPublicBranding } = useConfigStore()
  const navigate            = useNavigate()
  const [params]            = useSearchParams()

  useEffect(() => {
    fetchPublicBranding()
  }, [])

  const branding = getBrandingSources(isotipo_empresa, logo_empresa)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const res = await login(form.username, form.password)
    if (res.ok) {
      const rol = useAuthStore.getState().user?.rol
      const destinoPorRol = rol === 'REPARTIDOR' ? '/reparto' : '/'
      navigate(params.get('redirect') || destinoPorRol, { replace: true })
    } else {
      setError(res.error)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Logo de Marca e Isotipo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <img 
              src={branding.isotipoSrc} 
              alt="Isotipo Empresa" 
              style={{ width: 64, height: 64, objectFit: 'contain' }} 
            />
            <img 
              src={branding.logoSrc} 
              alt="Logo Empresa" 
              style={{ height: 48, maxWidth: 220, objectFit: 'contain' }} 
            />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            {nombre_empresa && nombre_empresa !== 'Propio' ? nombre_empresa : 'GasTubos'} — Sistema de Gestión Industrial
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 28,
        }}>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>
              Usuario o email
            </label>
            <input
              type="text"
              placeholder="usuario"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={verPassword ? "text" : "password"}
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setVerPassword(!verPassword)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-secondary)'
                }}
              >
                <i className={`ti ti-eye${verPassword ? '-off' : ''}`} style={{ fontSize: 18 }} />
              </button>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 16 }}>
              <i className="ti ti-alert-circle" />
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Ingresando...</> : <><i className="ti ti-login" /> Ingresar</>}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 20 }}>
          GasTubos v1.0 · Acceso seguro con JWT
        </p>
      </div>
    </div>
  )
}
