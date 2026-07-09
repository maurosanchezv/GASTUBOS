// gastubos/frontend/src/pages/PerfilPage.jsx
import { useState, useRef } from 'react'
import { useAuthStore } from '../store/authStore.js'
import { PageHeader, FormGroup, useToast } from '../components/ui.jsx'

export default function PerfilPage() {
  const { user, updateProfile } = useAuthStore()
  const { toast } = useToast()
  
  const [nombre, setNombre] = useState(user?.nombre || '')
  const [email,  setEmail]  = useState(user?.email || '')
  const [pass,   setPass]   = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [avatar, setAvatar] = useState(user?.avatar || null)
  
  const fileRef = useRef(null)

  const initials = user?.nombre?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || 'U'

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 1024 * 1024) return toast('La imagen debe ser menor a 1MB', 'error')

    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatar(reader.result) // base64
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const res = await updateProfile({ 
      nombre, 
      email, 
      avatar,
      password: pass || undefined 
    })
    setSaving(false)
    if (res.ok) {
      toast('Perfil actualizado correctamente', 'success')
      setPass('')
    } else {
      toast(res.error, 'error')
    }
  }

  return (
    <>
      <PageHeader title="Mi Perfil" subtitle="Gestioná tu información personal" />
      <div className="app-content">
        <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24, gap: 12 }}>
              <div 
                onClick={() => fileRef.current?.click()}
                style={{ 
                  width: 100, height: 100, borderRadius: '50%', background: 'var(--blue)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 600, color: '#fff',
                  cursor: 'pointer', overflow: 'hidden', border: '4px solid var(--surface-2)', boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                }}
              >
                {avatar ? <img src={avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Avatar" /> : initials}
              </div>
              <input type="file" ref={fileRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                <i className="ti ti-camera" /> Cambiar foto
              </button>
            </div>

            <div className="form-grid">
              <FormGroup label="Nombre completo" required>
                <input value={nombre} onChange={e => setNombre(e.target.value)} required />
              </FormGroup>
              <FormGroup label="Correo electrónico" required>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </FormGroup>
              <FormGroup label="Nombre de usuario (Login)">
                <input value={user?.username} disabled style={{ background: 'var(--surface-2)', cursor: 'not-allowed' }} />
              </FormGroup>
              <FormGroup label="Rol asignado">
                <input value={user?.rol} disabled style={{ background: 'var(--surface-2)', cursor: 'not-allowed' }} />
              </FormGroup>
              <FormGroup label="Nueva contraseña" hint="Dejar en blanco para no cambiar">
                <div style={{ position: 'relative' }}>
                  <input
                    type={verPassword ? "text" : "password"}
                    value={pass}
                    onChange={e => setPass(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
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
              </FormGroup>
            </div>

            <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : <><i className="ti ti-device-floppy" /> Guardar cambios</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
