// gastubos/frontend/src/pages/LoginPage.jsx
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'

export default function LoginPage() {
  const [form, setForm]     = useState({ username: '', password: '' })
  const [error, setError]   = useState('')
  const { login, loading }  = useAuthStore()
  const navigate            = useNavigate()
  const [params]            = useSearchParams()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const res = await login(form.username, form.password)
    if (res.ok) {
      navigate(params.get('redirect') || '/', { replace: true })
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
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52,
            background: 'var(--blue)',
            borderRadius: 14,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14,
          }}>
            <i className="ti ti-cylinder" style={{ fontSize: 26, color: '#fff' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>GasTubos</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Sistema de Gestión Industrial</div>
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
            <input
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
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
