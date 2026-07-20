// gastubos/frontend/src/pages/CilindrosTercerosPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api.js'
import { PageHeader, Modal, FormGroup, Spinner, EmptyState, formatCapacidad } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'
import { useConfigStore } from '../store/configStore.js'

const GASES = ['Oxígeno', 'CO2', 'Argón', 'Nitrógeno', 'Aire comprimido', 'Mezcla CO2/Argón', 'Acetileno']
const ESTADOS = ['PENDIENTE', 'ADQUIRIDO', 'DE_BAJA']

export default function CilindrosTercerosPage() {
  const { nombre_empresa } = useConfigStore()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState([])
  
  // Filtros
  const [q, setQ] = useState('')
  const [filterGas, setFilterGas] = useState('')
  const [filterEstado, setFilterEstado] = useState('PENDIENTE')
  const [filterCliente, setFilterCliente] = useState('')
  
  // Modales
  const [adquirirModal, setAdquirirModal] = useState(false)
  const [bajaModal, setBajaModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  
  // Formularios
  const [form, setForm] = useState({
    serie: '',
    gas: 'Oxígeno',
    capacidadLitros: 50,
    capacidadKg: '',
    observaciones: '',
    ubicacion: 'Depósito'
  })
  
  const [motivoBaja, setMotivoBaja] = useState('')

  // Estados de carga
  const [saving, setSaving] = useState(false)
  const [bajaSaving, setBajaSaving] = useState(false)
  
  const { toast } = useToast()

  // Cargar clientes para filtro
  useEffect(() => {
    api.get('/clientes')
      .then(res => setClientes(res.data))
      .catch(() => {})
  }, [])

  // Cargar cilindros de terceros
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { limit: 200 }
      if (filterEstado) params.estado = filterEstado
      if (filterGas) params.gas = filterGas
      if (filterCliente) params.clienteId = filterCliente
      if (q) params.q = q

      const res = await api.get('/cilindros-terceros', { params })
      setItems(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch { 
      toast('Error al cargar cilindros de terceros', 'error') 
    } finally { 
      setLoading(false) 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEstado, filterGas, filterCliente, q])

  useEffect(() => { load() }, [load])

  // Abrir modal de adquisición prellenado con los datos recibidos
  const openAdquirirModal = (item) => {
    setSelectedItem(item)
    
    const gasLower = (item.gas || '').toLowerCase()
    const isKg = gasLower === 'acetileno' || gasLower === 'co2'

    const capL = item.capacidadLitros !== null && item.capacidadLitros !== undefined ? Number(item.capacidadLitros) : ''
    const capK = item.capacidadKg !== null && item.capacidadKg !== undefined ? Number(item.capacidadKg) : ''

    let capVal = isKg ? (capK !== '' ? capK : capL) : (capL !== '' ? capL : capK)
    if ((capVal === '' || capVal === null || isNaN(capVal)) && item.observaciones) {
      const matchNum = item.observaciones.replace(/#\d+/g, '').match(/(\d+(?:\.\d+)?)/)
      if (matchNum) capVal = Number(matchNum[1])
    }

    setForm({
      serie: '',
      gas: item.gas || 'Oxígeno',
      capacidadLitros: isKg ? '' : (capVal || 6),
      capacidadKg: isKg ? (capVal || 10) : '',
      observaciones: `Adquirido desde recepción de tercero (${item.cliente?.nombre || 'Cliente'}).`,
      ubicacion: 'Depósito'
    })
    setAdquirirModal(true)
  }

  // Enviar formulario para registrar cilindro adquirido como PROPIO
  const handleAdquirirSubmit = async (e) => {
    e.preventDefault()
    if (!form.serie.trim()) {
      toast('Debe ingresar el número de serie físico del cilindro', 'error')
      return
    }

    setSaving(true)
    try {
      const isAcetileno = form.gas.toLowerCase() === 'acetileno'
      const payload = {
        serie: form.serie.trim(),
        gas: form.gas,
        capacidadLitros: isAcetileno ? undefined : Number(form.capacidadLitros),
        capacidadKg: isAcetileno ? Number(form.capacidadKg) : undefined,
        ubicacion: form.ubicacion,
        observaciones: form.observaciones
      }

      await api.post(`/cilindros-terceros/${selectedItem.id}/adquirir`, payload)

      toast(`Cilindro adquirido y registrado como propio (${nombre_empresa || 'Empresa'}) en estado DISPONIBLE`, 'success')
      setAdquirirModal(false)
      load()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al adquirir cilindro', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Dar de baja registro de tercero
  const handleBajaSubmit = async () => {
    setBajaSaving(true)
    try {
      await api.post(`/cilindros-terceros/${selectedItem.id}/baja`, {
        observaciones: motivoBaja,
      })
      toast('Cilindro de tercero descartado/dado de baja correctamente', 'success')
      setBajaModal(false)
      load()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al procesar la baja', 'error')
    } finally {
      setBajaSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Cilindros de Terceros Recibidos"
        subtitle={`${items.length} de ${total} recepciones de terceros`}
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
                Buscar Recepción
              </label>
              <div className="search-bar" style={{ width: '100%', marginBottom: 0 }}>
                <i className="ti ti-search" />
                <input
                  placeholder="Gas, cliente u observaciones..."
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
                Estado Recepción
              </label>
              <select 
                style={{ width: '100%', height: 38, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-mid)', background: 'var(--surface)' }} 
                value={filterEstado} 
                onChange={e => setFilterEstado(e.target.value)}
              >
                <option value="">Todos los estados</option>
                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
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

            {(filterGas || filterEstado || filterCliente || q) && (
              <button 
                className="btn" 
                style={{ height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => { setFilterGas(''); setFilterEstado('PENDIENTE'); setFilterCliente(''); setQ('') }}
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
              {items.length === 0 ? (
                <EmptyState icon="ti-package" message="No se encontraron recepciones de cilindros de terceros" />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Gas</th>
                      <th>Capacidad</th>
                      <th>Cliente de Origen</th>
                      <th>Entrega / Repartidor</th>
                      <th>Fecha Recepción</th>
                      <th>Estado</th>
                      <th>Tubo Adquirido</th>
                      <th style={{ textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      return (
                        <tr key={item.id}>
                          <td>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.gas}</span>
                          </td>
                          <td>{formatCapacidad(item)}</td>
                          <td>
                            <span style={{ fontWeight: 600, color: 'var(--blue)' }}>{item.cliente?.nombre || 'Cliente Desconocido'}</span>
                          </td>
                          <td>
                            <div style={{ fontSize: 13 }}>
                              {item.entrega ? `Entrega #${item.entrega.numero}` : 'Sin entrega directa'}
                            </div>
                            {item.repartidor && (
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                Chofer: {item.repartidor.nombre}
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {new Date(item.createdAt).toLocaleDateString('es-AR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td>
                            {item.estado === 'PENDIENTE' && <span className="badge badge-warning">PENDIENTE</span>}
                            {item.estado === 'ADQUIRIDO' && <span className="badge badge-success">ADQUIRIDO</span>}
                            {item.estado === 'DE_BAJA' && <span className="badge badge-danger">DADO DE BAJA</span>}
                          </td>
                          <td>
                            {item.tuboAdquirido ? (
                              <Link to={`/tubos/${item.tuboAdquirido.id}/detalle`} className="badge badge-info" style={{ textDecoration: 'none' }}>
                                {item.tuboAdquirido.id} ({item.tuboAdquirido.serie})
                              </Link>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>-</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              {item.estado === 'PENDIENTE' && (
                                <button 
                                  className="btn btn-sm btn-primary" 
                                  title={`Adquirir cilindro (ingresar número de serie e integrar como propio)`}
                                  onClick={() => openAdquirirModal(item)}
                                >
                                  <i className="ti ti-circle-plus" /> Adquirir
                                </button>
                              )}
                              {item.estado === 'PENDIENTE' && (
                                <button 
                                  className="btn btn-sm btn-danger" 
                                  title="Descartar / Dar de baja"
                                  onClick={() => { setSelectedItem(item); setMotivoBaja(''); setBajaModal(true) }}
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
              {items.length === 0 ? (
                <EmptyState icon="ti-package" message="No se encontraron recepciones de cilindros de terceros" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {items.map(item => {
                    return (
                      <div key={item.id} className="card" style={{ padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '15px' }}>{item.gas}</span>
                          {item.estado === 'PENDIENTE' && <span className="badge badge-warning">PENDIENTE</span>}
                          {item.estado === 'ADQUIRIDO' && <span className="badge badge-success">ADQUIRIDO</span>}
                          {item.estado === 'DE_BAJA' && <span className="badge badge-danger">BAJA</span>}
                        </div>
                        <div style={{ fontSize: 13, marginBottom: 4 }}>
                          <strong>Capacidad:</strong> {formatCapacidad(item)}
                        </div>
                        <div style={{ fontSize: 13, marginBottom: 4, color: 'var(--blue)' }}>
                          <strong>Cliente:</strong> {item.cliente?.nombre || 'Desconocido'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                          <strong>Recibido:</strong> {new Date(item.createdAt).toLocaleString('es-AR')} {item.repartidor ? `(${item.repartidor.nombre})` : ''}
                        </div>
                        {item.tuboAdquirido && (
                          <div style={{ fontSize: 12, marginBottom: 8 }}>
                            <strong>Tubo Integrado:</strong>{' '}
                            <Link to={`/tubos/${item.tuboAdquirido.id}/detalle`} style={{ fontWeight: 600 }}>
                              {item.tuboAdquirido.id} ({item.tuboAdquirido.serie})
                            </Link>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {item.estado === 'PENDIENTE' && (
                            <button className="btn btn-sm btn-primary" style={{ flex: '1 1 auto' }} onClick={() => openAdquirirModal(item)}>
                              <i className="ti ti-circle-plus" /> Adquirir (Registrar Serie)
                            </button>
                          )}
                          {item.estado === 'PENDIENTE' && (
                            <button className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }} onClick={() => { setSelectedItem(item); setMotivoBaja(''); setBajaModal(true) }}>
                              <i className="ti ti-trash" /> Descartar
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
      {adquirirModal && selectedItem && (
        <Modal open={true} title={`Adquirir Cilindro (Registrar en ${nombre_empresa || 'Inventario Propio'})`} onClose={() => setAdquirirModal(false)}>
          <form onSubmit={handleAdquirirSubmit}>
            <FormGroup label="Número de Serie del Cilindro (Requerido) *">
              <input
                required
                autoFocus
                placeholder="Ej: 987456 o Serie estampada..."
                value={form.serie}
                onChange={e => setForm(prev => ({ ...prev, serie: e.target.value }))}
              />
            </FormGroup>

            <FormGroup label="Tipo de Gas">
              <input readOnly value={form.gas} disabled />
            </FormGroup>

            {form.gas.toLowerCase() === 'acetileno' ? (
              <FormGroup label="Capacidad (kg) *" required>
                <select
                  value={form.capacidadKg}
                  onChange={e => setForm(prev => ({ ...prev, capacidadKg: e.target.value }))}
                  required
                >
                  <option value="">Seleccionar...</option>
                  {[1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8].map(kg => (
                    <option key={kg} value={kg}>{kg} kg</option>
                  ))}
                </select>
              </FormGroup>
            ) : form.gas.toLowerCase() === 'co2' ? (
              <FormGroup label="Capacidad (kg) *" required>
                <select
                  value={form.capacidadKg}
                  onChange={e => setForm(prev => ({ ...prev, capacidadKg: e.target.value }))}
                  required
                >
                  <option value="">Seleccionar...</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 10, 13, 15, 20, 25, 30].map(kg => (
                    <option key={kg} value={kg}>{kg} kg</option>
                  ))}
                </select>
              </FormGroup>
            ) : (
              <FormGroup label="Capacidad (m³) *" required>
                <select
                  value={form.capacidadLitros}
                  onChange={e => setForm(prev => ({ ...prev, capacidadLitros: e.target.value }))}
                  required
                >
                  <option value="">Seleccionar...</option>
                  {[1, 1.5, 2.5, 3, 4, 5, 6, 6.5, 7, 7.15, 7.5, 8.5].map(m3 => (
                    <option key={m3} value={m3}>{m3} m³</option>
                  ))}
                </select>
              </FormGroup>
            )}

            <FormGroup label="Ubicación Inicial">
              <input
                placeholder="Depósito"
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
                {saving ? 'Registrando...' : `Registrar como Tubo DISPONIBLE`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Dar de Baja */}
      {bajaModal && selectedItem && (
        <Modal 
          open={true} 
          title="Descartar / Dar de Baja Recepción de Tercero" 
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
            <p style={{ marginBottom: 12 }}>¿Estás seguro de que deseas descartar esta recepción de <strong>{selectedItem.gas} ({formatCapacidad(selectedItem)})</strong> del cliente <strong>{selectedItem.cliente?.nombre}</strong>?</p>
            <FormGroup label="Motivo del descarte">
              <textarea
                placeholder="Escribe la razón..."
                value={motivoBaja}
                onChange={e => setMotivoBaja(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border-mid)' }}
              />
            </FormGroup>
          </div>
        </Modal>
      )}
    </>
  )
}
