// gastubos/frontend/src/pages/TuboPublicoPage.jsx
//
// Esta es la página que ve CUALQUIER persona que escanea el QR.
// URL: /tubos/TUBO-000001
// - Muestra info básica sin autenticación.
// - Si el usuario está logueado, ofrece acciones (cambiar estado, entrega, etc).
// - Si no está logueado, muestra botón de login.

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import api from '../services/api.js'
import { formatCapacidad } from '../components/ui.jsx'

const ESTADO_COLOR = {
  DISPONIBLE:'#3B6D11', CARGADO:'#185FA5', VACIO:'#5F5E5A',
  ENTREGADO:'#0F6E56',  ALQUILADO:'#534AB7', VENDIDO:'#BA7517',
  RESERVADO:'#185FA5',  PERDIDO:'#A32D2D', DEVUELTO:'#993C1D', EN_REVISION:'#BA7517',
}

export default function TuboPublicoPage() {
  const { id }      = useParams()
  const { user }    = useAuthStore()
  const [tubo, setTubo]     = useState(null)
  const [error, setError]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Llama al endpoint público (sin auth) usando la nueva ruta /api/public/tubos
    api.get(`/public/tubos/${id}`)
      .then(res => setTubo(res.data))
      .catch(() => setError('Tubo no encontrado'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <p style={{ color: '#888', textAlign: 'center', padding: 32 }}>Cargando...</p>
      </div>
    </div>
  )

  if (error) return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <p style={{ color: '#A32D2D', textAlign: 'center', padding: 32 }}>{error}</p>
      </div>
    </div>
  )

  const color = ESTADO_COLOR[tubo.estado] || '#888'

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        {/* Header */}
        <div style={{ background: color, padding: '20px 24px', borderRadius: '12px 12px 0 0' }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>{tubo.id}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', marginTop: 4 }}>
            {tubo.gas} · {formatCapacidad(tubo)}
          </div>
          <span style={{ display:'inline-block', marginTop: 8, background:'rgba(255,255,255,.25)', color:'#fff', padding:'3px 10px', borderRadius:10, fontSize:12, fontWeight:600 }}>
            {tubo.estado.replace('_',' ')}
          </span>
        </div>

        {/* Info */}
        <div style={{ padding: '16px 24px' }}>
          {[
            ['Propietario', tubo.propietario === 'CLIENTE' ? `CLIENTE - ${tubo.propietarioCliente?.nombre || tubo.cliente?.nombre || '—'}` : (tubo.nombre_empresa || 'PROPIO').toUpperCase()],
            ['Ubicación',   tubo.ubicacion   || '—'],
            ['Cliente',     tubo.cliente?.nombre || '—'],
            ['Actualizado', new Date(tubo.updatedAt).toLocaleString('es-PY')],
          ].map(([k, v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'0.5px solid rgba(0,0,0,.08)', fontSize:13 }}>
              <span style={{ color:'#888' }}>{k}</span>
              <span style={{ fontWeight:500 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Acciones */}
        <div style={{ padding: '12px 24px 24px', display:'flex', flexDirection:'column', gap:8 }}>
          {user ? (
            <>
              <Link to={`/tubos/${id}/detalle`} style={styles.btnPrimary}>
                Ver detalle completo
              </Link>
              <Link to={`/entregas?tubo=${id}`} style={styles.btn}>
                Registrar entrega
              </Link>
              <Link to={`/devoluciones?tubo=${id}`} style={styles.btn}>
                Registrar devolución
              </Link>
            </>
          ) : (
            <>
              <div style={{ fontSize:12, color:'#888', textAlign:'center', marginBottom:4 }}>
                Iniciá sesión para registrar operaciones
              </div>
              <Link to={`/login?redirect=/tubos/${id}`} style={styles.btnPrimary}>
                Iniciar sesión
              </Link>
            </>
          )}
        </div>

        <div style={{ textAlign:'center', padding:'0 0 16px', fontSize:11, color:'#bbb' }}>
          GasTubos · {window.location.host}
        </div>
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    minHeight: '100vh',
    background: '#f5f4f0',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '24px 16px',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    border: '0.5px solid rgba(0,0,0,.1)',
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
  },
  btnPrimary: {
    display: 'block',
    background: '#185FA5',
    color: '#fff',
    textAlign: 'center',
    padding: '10px 16px',
    borderRadius: 8,
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 500,
  },
  btn: {
    display: 'block',
    background: 'transparent',
    color: '#185FA5',
    textAlign: 'center',
    padding: '9px 16px',
    borderRadius: 8,
    textDecoration: 'none',
    fontSize: 13,
    border: '0.5px solid rgba(24,95,165,.4)',
  },
}
