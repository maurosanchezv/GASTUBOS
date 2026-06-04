// gastubos/frontend/src/pages/UsuariosPage.jsx
import { useState, useEffect } from 'react'
import api from '../services/api.js'
import { PageHeader, Modal, FormGroup, Spinner, RolBadge } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'

const EMPTY = { username: '', email: '', nombre: '', rol: 'OPERADOR', password: '' }

const PERMISOS = [
  ['Crear/editar usuarios',       true, false, false],
  ['Crear/editar tubos',          true, false, true],
  ['Cambiar estado de tubos',     true, true,  true],
  ['Registrar entregas',          true, true,  true],
  ['Registrar devoluciones',      true, true,  true],
  ['Ver reportes',                true, true,  true],
  ['Exportar datos',              true, true,  false],
  ['Configurar sistema',          true, false, false],
]

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading]  = useState(true)
  const [modal,   setModal]    = useState(false)
  const [form,    setForm]     = useState(EMPTY)
  const [saving,  setSaving]   = useState(false)
  const { toast }              = useToast()

  useEffect(() => {
    api.get('/usuarios').then(r => setUsuarios(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (form.id) await api.patch(`/usuarios/${form.id}`, form)
      else await api.post('/usuarios', form)
      toast(`Usuario ${form.id ? 'actualizado' : 'creado'}`, 'success')
      setModal(false); setForm(EMPTY)
      const r = await api.get('/usuarios'); setUsuarios(r.data)
    } catch (err) { toast(err.response?.data?.error || 'Error', 'error') }
    finally { setSaving(false) }
  }

  const handleToggle = async (u) => {
    try {
      await api.patch(`/usuarios/${u.id}`, { activo: !u.activo })
      setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, activo: !x.activo } : x))
    } catch { toast('Error al actualizar usuario', 'error') }
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <>
      <PageHeader
        title="Usuarios y Roles"
        subtitle="Gestión de accesos al sistema"
        actions={<button className="btn btn-sm btn-primary" onClick={() => { setForm(EMPTY); setModal(true) }}><i className="ti ti-plus" /> Nuevo Usuario</button>}
      />
      <div className="app-content">
        {loading ? <Spinner /> : (
          <>
            {/* VISTA TABLE (Desktop) */}
            <div className="card table-wrap hide-mobile" style={{ padding: 0, marginBottom: 16 }}>
              <table>
                <thead><tr><th>Usuario</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th style={{ textAlign: 'right' }}>Acciones</th></tr></thead>
                <tbody>
                  {usuarios.map(u => {
                    const initials = u.nombre?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || 'U'
                    return (
                      <tr key={u.id}>
                        <td className="td-code">{u.username}</td>
                        <td style={{ fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ 
                              width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-2)', 
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                              overflow: 'hidden', border: '1px solid var(--border)'
                            }}>
                              {u.avatar ? <img src={u.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                            </div>
                            {u.nombre}
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                        <td><RolBadge rol={u.rol} /></td>
                        <td>
                          <span className={`badge badge-${u.activo ? 'ACTIVO' : 'VACIO'}`}>
                            {u.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <button className="btn-icon" title="Editar" onClick={() => { setForm({ ...u, password: '' }); setModal(true) }}>
                                <i className="ti ti-edit" />
                              </button>
                              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>Editar</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <button className="btn-icon" title={u.activo ? 'Desactivar' : 'Activar'} onClick={() => handleToggle(u)}>
                                <i className={`ti ${u.activo ? 'ti-user-off' : 'ti-user-check'}`} />
                              </button>
                              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>{u.activo ? 'Baja' : 'Alta'}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* VISTA CARDS (Mobile) */}
            <div className="mobile-list">
              {usuarios.map(u => {
                const initials = u.nombre?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || 'U'
                return (
                  <div key={u.id} className="list-card">
                    <div className="list-card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ 
                          width: 36, height: 36, borderRadius: '50%', background: 'var(--surface-2)', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                          overflow: 'hidden', border: '1px solid var(--border)'
                        }}>
                          {u.avatar ? <img src={u.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                        </div>
                        <div className="list-card-title">{u.username}</div>
                      </div>
                      <RolBadge rol={u.rol} />
                    </div>
                  
                    <div className="list-card-body">
                      <div className="list-card-item col-span-2">
                        <span className="list-card-label">Nombre</span>
                        <span className="list-card-value">{u.nombre}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Email</span>
                        <span className="list-card-value">{u.email}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Estado</span>
                        <span className={`badge badge-${u.activo ? 'ACTIVO' : 'VACIO'}`} style={{ width: 'fit-content' }}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </div>

                    <div className="list-card-actions" style={{ justifyContent: 'flex-end', gap: 16, paddingTop: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <button className="btn-icon" onClick={() => { setForm({ ...u, password: '' }); setModal(true) }}
                          style={{ width: 44, height: 44, fontSize: 20 }}>
                          <i className="ti ti-edit" />
                        </button>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Editar</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <button className="btn-icon" onClick={() => handleToggle(u)}
                          style={{ width: 44, height: 44, fontSize: 20 }}>
                          <i className={`ti ${u.activo ? 'ti-user-off' : 'ti-user-check'}`} />
                        </button>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>{u.activo ? 'Dar Baja' : 'Dar Alta'}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Matriz de permisos */}
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <div className="card-title">Permisos por rol</div>
          </div>
          
          {/* Vista Tabla (Desktop) */}
          <div className="table-wrap hide-mobile">
            <table style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
              <thead>
                <tr>
                  <th style={{ background: 'var(--surface-2)', padding: '12px' }}>Acción / Permiso</th>
                  <th style={{ textAlign: 'center', background: 'var(--blue-light)', color: 'var(--blue-dark)' }}>Admin</th>
                  <th style={{ textAlign: 'center', background: 'var(--teal-light)', color: 'var(--teal)' }}>Supervisor</th>
                  <th style={{ textAlign: 'center', background: 'var(--gray-light)', color: 'var(--gray)' }}>Operador</th>
                </tr>
              </thead>
              <tbody>
                {PERMISOS.map(([p, a, s, o]) => (
                  <tr key={p}>
                    <td style={{ fontWeight: 500, padding: '12px' }}>{p}</td>
                    {[a, s, o].map((v, i) => (
                      <td key={i} style={{ textAlign: 'center' }}>
                        {v ? (
                          <span style={{ color: 'var(--green)', fontSize: 18 }}><i className="ti ti-circle-check-filled" /></span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 18, opacity: 0.3 }}><i className="ti ti-circle-x" /></span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vista Cards (Mobile) — Se muestra vía CSS en pantallas pequeñas */}
          <div className="mobile-list">
            {PERMISOS.map(([p, a, s, o]) => (
              <div key={p} className="list-card" style={{ background: 'var(--surface-2)', marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--blue)' }}>{p}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ 
                    flex: 1, textAlign: 'center', padding: '6px', borderRadius: 6,
                    background: a ? 'var(--green-light)' : 'var(--gray-light)',
                    opacity: a ? 1 : 0.5
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: a ? 'var(--green)' : 'var(--text-muted)' }}>ADMIN</div>
                    <i className={`ti ${a ? 'ti-circle-check-filled' : 'ti-circle-x'}`} style={{ color: a ? 'var(--green)' : 'var(--text-muted)' }} />
                  </div>
                  <div style={{ 
                    flex: 1, textAlign: 'center', padding: '6px', borderRadius: 6,
                    background: s ? 'var(--green-light)' : 'var(--gray-light)',
                    opacity: s ? 1 : 0.5
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: s ? 'var(--green)' : 'var(--text-muted)' }}>SUP</div>
                    <i className={`ti ${s ? 'ti-circle-check-filled' : 'ti-circle-x'}`} style={{ color: s ? 'var(--green)' : 'var(--text-muted)' }} />
                  </div>
                  <div style={{ 
                    flex: 1, textAlign: 'center', padding: '6px', borderRadius: 6,
                    background: o ? 'var(--green-light)' : 'var(--gray-light)',
                    opacity: o ? 1 : 0.5
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: o ? 'var(--green)' : 'var(--text-muted)' }}>OPE</div>
                    <i className={`ti ${o ? 'ti-circle-check-filled' : 'ti-circle-x'}`} style={{ color: o ? 'var(--green)' : 'var(--text-muted)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={modal}
        title={form.id ? `Editar: ${form.username}` : 'Nuevo Usuario'}
        onClose={() => setModal(false)}
        footer={
          <>
            <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : <><i className="ti ti-device-floppy" /> Guardar</>}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <FormGroup label="Nombre completo" required>
            <input value={form.nombre} onChange={f('nombre')} required />
          </FormGroup>
          <FormGroup label="Usuario" required>
            <input value={form.username} onChange={f('username')} required readOnly={!!form.id} />
          </FormGroup>
          <FormGroup label="Email" required>
            <input type="email" value={form.email} onChange={f('email')} required />
          </FormGroup>
          <FormGroup label="Rol">
            <select value={form.rol} onChange={f('rol')}>
              <option value="ADMIN">Administrador</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="OPERADOR">Operador</option>
            </select>
          </FormGroup>
          <FormGroup label={form.id ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'} required={!form.id}>
            <input type="password" value={form.password} onChange={f('password')} placeholder="Mínimo 8 caracteres" required={!form.id} />
          </FormGroup>
        </div>
      </Modal>
    </>
  )
}
