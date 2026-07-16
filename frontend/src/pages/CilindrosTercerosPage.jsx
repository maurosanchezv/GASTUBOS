// gastubos/frontend/src/pages/CilindrosTercerosPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api.js'
import { PageHeader, Modal, FormGroup, Spinner, EmptyState, StateBadge, formatCapacidad } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'
import { TRANSICIONES } from '../utils/estadosTubo.js'
import { useConfigStore } from '../store/configStore.js'

const GASES = ['Oxígeno', 'CO2', 'Argón', 'Nitrógeno', 'Aire comprimido', 'Mezcla CO2/Argón', 'Acetileno']
const ESTADOS = ['DEVUELTO', 'VACIO', 'EN_REVISION', 'CARGADO', 'DISPONIBLE', 'DE_BAJA']

export default function CilindrosTercerosPage() {
  const { nombre_empresa } = useConfigStore()
  const [tubos, setTubos] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState([])
  
  // Filtros
  const [q, setQ] = useState('')
  const [filterGas, setFilterGas] = useState('')
  const [filterEstado, setFilterEstado] = useState('')
  const [filterCliente, setFilterCliente] = useState('')
  const [hideBaja, setHideBaja] = useState(true)
  
  // Modales
  const [adquirirModal, setAdquirirModal] = useState(false)
  const [estadoModal, setEstadoModal] = useState(false)
  const [bajaModal, setBajaModal] = useState(false)
  const [selectedTubo, setSelectedTubo] = useState(null)
  
  // Formularios
  const [form, setForm] = useState({
    serie: '',
    gas: 'Oxígeno',
    capacidadLitros: 50,
    capacidadKg: '',
    observaciones: '',
    ubicacion: 'Depósito'
  })
  
  const [nuevoEstado, setNuevoEstado] = useState('')
  const [observacionesEstado, setObservacionesEstado] = useState('')
  const [motivoBaja, setMotivoBaja] = useState('')

  // Estados de carga (saving)
  const [saving, setSaving] = useState(false)
  const [cambioEstadoSaving, setCambioEstadoSaving] = useState(false)
  const [bajaSaving, setBajaSaving] = useState(false)
  
  const { toast } = useToast()

  // Cargar clientes
  useEffect(() => {
    api.get('/clientes')
      .then(res => setClientes(res.data))
      .catch(() => {})
  }, [])

  // Cargar cilindros de terceros (id empieza con CLI_ o CLI-)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/tubos', { 
        params: { 
          retornos: 'true', 
          limit: 200 
        } 
      })
      setTubos(res.data.tubos)
      setTotal(res.data.total)
    } catch { 
      toast('Error al cargar cilindros de terceros', 'error') 
    } finally { 
      setLoading(false) 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  // Helper para buscar el nombre del cliente dueño
  const getClienteNombre = (id) => {
    const c = clientes.find(x => x.id === id)
    return c ? c.nombre : 'Cliente Desconocido'
  }

  // Filtrado de tubos en el cliente
  const getFilteredTubos = () => {
    return tubos.filter(t => {
      // Filtrar para mostrar SOLO los que empiezan con CLI
      if (!t.id.startsWith('CLI_') && !t.id.startsWith('CLI-')) return false

      // Buscar coincidencia en la query (q)
      if (q) {
        const qLower = q.toLowerCase()
        const clienteNombre = getClienteNombre(t.propietarioClienteId).toLowerCase()
        const matchesQ = 
          t.id.toLowerCase().includes(qLower) || 
          (t.serie && t.serie.toLowerCase().includes(qLower)) ||
          t.gas.toLowerCase().includes(qLower) ||
          clienteNombre.includes(qLower)
        if (!matchesQ) return false
      }
      
      // Filtro por Gas
      if (filterGas && t.gas !== filterGas) return false
      
      // Filtro por Estado
      if (filterEstado && t.estado !== filterEstado) return false
      
      // Filtro por Cliente propietario
      if (filterCliente && t.propietarioClienteId !== filterCliente) return false

      // Ocultar dados de baja si está marcado y no se filtra por ese estado
      if (hideBaja && !filterEstado && t.estado === 'DE_BAJA') return false
      
      return true
    })
  }

  const filteredTubos = getFilteredTubos()

  // Abrir modal de adquisición prellenado con los datos
  const openAdquirirModal = (tubo) => {
    setSelectedTubo(tubo)
    
    // Extraer datos del id CLI_Gas_Capacidad_Random
    let gas = tubo.gas || 'Oxígeno'
    let capL = tubo.capacidadLitros || 50
    let capK = tubo.capacidadKg || ''
    
    if (tubo.id.startsWith('CLI_') || tubo.id.startsWith('CLI-')) {
      const sep = tubo.id.startsWith('CLI_') ? '_' : '-'
      const parts = tubo.id.split(sep)
      if (parts.length >= 3) {
        gas = parts[1]
        const capRaw = parts[2]
        if (capRaw.toLowerCase().includes('kg')) {
          capK = parseFloat(capRaw)
          capL = ''
        } else {
          capL = parseInt(capRaw)
          capK = ''
        }
      }
    }

    setForm({
      serie: '',
      gas,
      capacidadLitros: capL,
      capacidadKg: capK,
      observaciones: `Adquirido desde retorno de cliente. ID anterior: ${tubo.id}`,
      ubicacion: tubo.ubicacion || 'Depósito'
    })
    setAdquirirModal(true)
  }

  // Enviar formulario para registrar cilindro adquirido como PROPIO
  const handleAdquirirSubmit = async (e) => {
    e.preventDefault()
    if (!form.serie.trim()) {
      toast('Debe ingresar un número de cilindro para el nuevo cilindro', 'error')
      return
    }

    setSaving(true)
    try {
      const isAcetileno = form.gas.toLowerCase() === 'acetileno'
      const payload = {
        ...form,
        capacidadLitros: isAcetileno ? undefined : Number(form.capacidadLitros),
        capacidadKg: isAcetileno ? Number(form.capacidadKg) : undefined,
        propietario: 'PROPIO',
        estado: 'DISPONIBLE'
      }

      // 1. Crear nuevo tubo como propio
      await api.post('/tubos', payload)
      
      // 2. Desactivar el cilindro temporal de tercero (CLI_...)
      await api.patch(`/tubos/${selectedTubo.id}`, { activo: false })

      toast(`Cilindro adquirido y registrado como ${nombre_empresa.toLowerCase()} correctamente`, 'success')
      setAdquirirModal(false)
      load()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al adquirir cilindro', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Cambiar estado del tubo seleccionado
  const handleCambioEstadoSubmit = async (e) => {
    e.preventDefault()
    if (!nuevoEstado) return
    
    setCambioEstadoSaving(true)
    try {
      await api.post(`/tubos/${selectedTubo.id}/cambiar-estado`, {
        estadoNuevo: nuevoEstado,
        observaciones: observacionesEstado
      })
      toast('Estado del cilindro actualizado correctamente', 'success')
      setEstadoModal(false)
      setNuevoEstado('')
      setObservacionesEstado('')
      load()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al cambiar el estado del cilindro', 'error')
    } finally {
      setCambioEstadoSaving(false)
    }
  }

  // Dar de baja (cambiar estado a DE_BAJA) el tubo seleccionado
  const handleBajaSubmit = async () => {
    setBajaSaving(true)
    try {
      await api.post(`/tubos/${selectedTubo.id}/cambiar-estado`, {
        estadoNuevo: 'DE_BAJA',
        observaciones: motivoBaja,
      })
      toast('Cilindro dado de baja correctamente', 'success')
      setBajaModal(false)
      load()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al dar de baja el cilindro', 'error')
    } finally {
      setBajaSaving(false)
    }
  }

  // Obtener transiciones válidas del cilindro seleccionado
  const transitions = selectedTubo ? (TRANSICIONES[selectedTubo.estado] || []) : []

  return (
    <>
      <PageHeader
        title="Cilindros de Terceros"
        subtitle={`${filteredTubos.length} de ${total} cilindros retornados en lista`}
        actions={
          <button
            className="btn btn-sm"
            onClick={load}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <i className={`ti ti-refresh ${loading ? 'ti-spin' : ''}`} />
            Actualizar
          </button>
        }
      />

      <div className="app-content">
        {/* Filtros */}
        <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Buscar Cilindro
              </label>
              <div className="search-bar" style={{ width: '100%', marginBottom: 0 }}>
                <i className="ti ti-search" />
                <input
                  placeholder="ID, gas o cliente..."
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
                {q && <button className="btn-icon" onClick={() => setQ('')}><i className="ti ti-x" /></button>}
              </div>
            </div>

            <div style={{ flex: '0 1 150px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Gas
              </label>
              <select 
                style={{ width: '100%', height: 38, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-mid)', background: 'var(--surface)' }} 
                value={filterGas} 
                onChange={e => setFilterGas(e.target.value)}
              >
                <option value="">Todos los gases</option>
                {GASES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div style={{ flex: '0 1 150px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Estado
              </label>
              <select 
                style={{ width: '100%', height: 38, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-mid)', background: 'var(--surface)' }} 
                value={filterEstado} 
                onChange={e => setFilterEstado(e.target.value)}
              >
                <option value="">Todos los estados</option>
                {ESTADOS.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
              </select>
            </div>

            <div style={{ flex: '1 1 200px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Cliente de Origen
              </label>
              <select 
                style={{ width: '100%', height: 38, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-mid)', background: 'var(--surface)' }} 
                value={filterCliente} 
                onChange={e => setFilterCliente(e.target.value)}
              >
                <option value="">Todos los clientes</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', height: 38 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, userSelect: 'none', cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={hideBaja}
                  onChange={e => setHideBaja(e.target.checked)}
                />
                Ocultar dados de baja
              </label>
            </div>

            {(filterGas || filterEstado || filterCliente || q) && (
              <button 
                className="btn" 
                style={{ height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => { setFilterGas(''); setFilterEstado(''); setFilterCliente(''); setQ('') }}
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {loading ? <Spinner /> : (
          <>
            {/* VISTA TABLA (Desktop) */}
            <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
              {filteredTubos.length === 0 ? (
                <EmptyState icon="ti-package" message="No se encontraron cilindros de terceros" />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Código / ID</th>
                      <th>Gas</th>
                      <th>Capacidad</th>
                      <th>Estado</th>
                      <th>Ubicación Actual</th>
                      <th>Origen (Cliente)</th>
                      <th>Fecha Retorno</th>
                      <th style={{ textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTubos.map(t => {
                      return (
                        <tr key={t.id}>
                          <td>
                            <span style={{ fontWeight: 600, color: 'var(--blue)', fontSize: '13px' }}>{t.id}</span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>{t.gas}</span>
                          </td>
                          <td>{formatCapacidad(t)}</td>
                          <td>
                            <StateBadge estado={t.estado} />
                          </td>
                          <td>
                            <span className="badge badge-info">{t.ubicacion || 'Depósito'}</span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 500 }}>{getClienteNombre(t.propietarioClienteId)}</span>
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {new Date(t.createdAt).toLocaleDateString('es-AR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button 
                                className="btn btn-sm btn-primary" 
                                title={`Adquirir cilindro (pasar a ${nombre_empresa.toLowerCase()})`}
                                onClick={() => openAdquirirModal(t)}
                              >
                                <i className="ti ti-circle-plus" /> Adquirir
                              </button>
                              <button 
                                className="btn btn-sm" 
                                title="Cambiar estado"
                                onClick={() => { setSelectedTubo(t); setNuevoEstado(''); setObservacionesEstado(''); setEstadoModal(true) }}
                              >
                                <i className="ti ti-refresh" /> Estado
                              </button>
                              <Link 
                                to={`/tubos/${t.id}/detalle`} 
                                className="btn btn-sm"
                                title="Ver detalle y auditoría"
                              >
                                <i className="ti ti-eye" /> Detalle
                              </Link>
                              {t.estado !== 'DE_BAJA' && t.estado !== 'RESERVADO' && t.estado !== 'VENDIDO' && (
                                <button 
                                  className="btn btn-sm btn-danger" 
                                  title="Dar de baja"
                                  onClick={() => { setSelectedTubo(t); setMotivoBaja(''); setBajaModal(true) }}
                                >
                                  <i className="ti ti-trash" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* VISTA CARDS (Móvil) */}
            <div className="mobile-list">
              {filteredTubos.length === 0 ? (
                <EmptyState icon="ti-package" message="No se encontraron cilindros de terceros" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filteredTubos.map(t => {
                    return (
                      <div key={t.id} className="card" style={{ padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: 'var(--blue)', fontSize: '14px' }}>{t.id}</span>
                          <StateBadge estado={t.estado} />
                        </div>
                        <div style={{ fontSize: 13, marginBottom: 4 }}>
                          <strong>Gas:</strong> {t.gas}
                        </div>
                        <div style={{ fontSize: 13, marginBottom: 4 }}>
                          <strong>Capacidad:</strong> {formatCapacidad(t)}
                        </div>
                        <div style={{ fontSize: 13, marginBottom: 4, color: 'var(--text-secondary)' }}>
                          <strong>Cliente Origen:</strong> {getClienteNombre(t.propietarioClienteId)}
                        </div>
                        <div style={{ fontSize: 13, marginBottom: 4 }}>
                          <strong>Ubicación:</strong> <span className="badge badge-info">{t.ubicacion || 'Depósito'}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                          <strong>Retornado:</strong> {new Date(t.createdAt).toLocaleString('es-AR')}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn btn-sm btn-primary" style={{ flex: '1 1 auto' }} onClick={() => openAdquirirModal(t)}>
                            <i className="ti ti-circle-plus" /> Adquirir
                          </button>
                          <button 
                            className="btn btn-sm" 
                            style={{ flex: '1 1 auto' }} 
                            onClick={() => { setSelectedTubo(t); setNuevoEstado(''); setObservacionesEstado(''); setEstadoModal(true) }}
                          >
                            <i className="ti ti-refresh" /> Estado
                          </button>
                          <Link to={`/tubos/${t.id}/detalle`} className="btn btn-sm" style={{ flex: '1 1 auto', display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }}>
                            <i className="ti ti-eye" /> Detalle
                          </Link>
                          {t.estado !== 'DE_BAJA' && t.estado !== 'RESERVADO' && t.estado !== 'VENDIDO' && (
                            <button className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }} onClick={() => { setSelectedTubo(t); setMotivoBaja(''); setBajaModal(true) }}>
                              <i className="ti ti-trash" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal Adquirir Cilindro */}
      {adquirirModal && (
        <Modal open={true} title={`Adquirir Cilindro (Pasar a ${nombre_empresa || 'Propio'})`} onClose={() => setAdquirirModal(false)}>
          <form onSubmit={handleAdquirirSubmit}>
            <FormGroup label="Número de Cilindro *">
              <input
                required
                placeholder="Ej: 12345"
                value={form.serie}
                onChange={e => setForm(prev => ({ ...prev, serie: e.target.value }))}
              />
            </FormGroup>

            <FormGroup label="Gas">
              <input readOnly value={form.gas} disabled />
            </FormGroup>

            <FormGroup label="Capacidad">
              <input readOnly value={formatCapacidad(form)} disabled />
            </FormGroup>

            <FormGroup label="Ubicación">
              <input
                placeholder="Ej: Depósito Central"
                value={form.ubicacion}
                onChange={e => setForm(prev => ({ ...prev, ubicacion: e.target.value }))}
              />
            </FormGroup>

            <FormGroup label="Observaciones">
              <textarea
                rows={3}
                placeholder="Detalle o estado del tubo..."
                value={form.observaciones}
                onChange={e => setForm(prev => ({ ...prev, observaciones: e.target.value }))}
              />
            </FormGroup>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn" onClick={() => setAdquirirModal(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Registrando...' : `Registrar como ${nombre_empresa || 'Propio'}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Cambiar Estado */}
      {estadoModal && (
        <Modal 
          open={true} 
          title="Cambiar Estado del Cilindro" 
          onClose={() => setEstadoModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setEstadoModal(false)}>Cancelar</button>
              <button 
                className="btn btn-primary" 
                onClick={handleCambioEstadoSubmit} 
                disabled={!nuevoEstado || cambioEstadoSaving}
              >
                {cambioEstadoSaving ? 'Guardando...' : 'Confirmar Cambio'}
              </button>
            </>
          }
        >
          {selectedTubo && (
            <form onSubmit={handleCambioEstadoSubmit}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Código del tubo: <strong style={{ color: 'var(--text-primary)' }}>{selectedTubo.id}</strong>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Estado actual: <StateBadge estado={selectedTubo.estado} />
                </div>
              </div>

              <FormGroup label="Nuevo estado" required>
                <select value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {transitions.map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </FormGroup>

              {transitions.length === 0 && (
                <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4, marginBottom: 14 }}>
                  No hay transiciones de estado permitidas desde {selectedTubo.estado}.
                </div>
              )}

              <FormGroup label="Observación">
                <textarea
                  rows={2}
                  placeholder="Motivo del cambio de estado..."
                  value={observacionesEstado}
                  onChange={e => setObservacionesEstado(e.target.value)}
                />
              </FormGroup>
            </form>
          )}
        </Modal>
      )}

      {/* Modal Dar de Baja */}
      {bajaModal && (
        <Modal 
          open={true} 
          title="Dar de Baja Cilindro de Tercero" 
          onClose={() => setBajaModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setBajaModal(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleBajaSubmit} disabled={bajaSaving}>
                {bajaSaving ? 'Procesando...' : 'Confirmar Baja'}
              </button>
            </>
          }
        >
          <div style={{ padding: '10px 0' }}>
            <p style={{ marginBottom: 12 }}>¿Estás seguro de que deseas dar de baja el cilindro <strong>{selectedTubo?.id}</strong>?</p>
            <FormGroup label="Motivo de la baja" required>
              <textarea
                placeholder="Escribe el motivo del descarte/baja..."
                value={motivoBaja}
                onChange={e => setMotivoBaja(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border-mid)' }}
                required
              />
            </FormGroup>
          </div>
        </Modal>
      )}
    </>
  )
}
