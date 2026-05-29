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
          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Usuario</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.id}>
                      <td className="td-code">{u.username}</td>
                      <td style={{ fontWeight: 500 }}>{u.nombre}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                      <td><RolBadge rol={u.rol} /></td>
                      <td>
                        <span className={`badge badge-${u.activo ? 'ACTIVO' : 'VACIO'}`}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-icon" title="Editar" onClick={() => { setForm({ ...u, password: '' }); setModal(true) }}>
                            <i className="ti ti-edit" />
                          </button>
                          <button className="btn-icon" title={u.activo ? 'Desactivar' : 'Activar'} onClick={() => handleToggle(u)}>
                            <i className={`ti ${u.activo ? 'ti-user-off' : 'ti-user-check'}`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Matriz de permisos */}
        <div className="card">
          <div className="card-header"><div className="card-title">Permisos por rol</div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Permiso</th><th style={{ textAlign: 'center' }}>Admin</th><th style={{ textAlign: 'center' }}>Supervisor</th><th style={{ textAlign: 'center' }}>Operador</th></tr></thead>
              <tbody>
                {PERMISOS.map(([p, a, s, o]) => (
                  <tr key={p}>
                    <td>{p}</td>
                    {[a, s, o].map((v, i) => (
                      <td key={i} style={{ textAlign: 'center' }}>
                        <i className={`ti ${v ? 'ti-circle-check' : 'ti-circle-x'}`} style={{ fontSize: 16, color: v ? 'var(--green)' : 'var(--border-mid)' }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
