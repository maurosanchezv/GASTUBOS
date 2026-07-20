// gastubos/frontend/src/pages/CamionesPage.jsx
import { useState, useEffect, useCallback } from 'react'
import api from '../services/api.js'
import { PageHeader, Modal, FormGroup, Spinner, EmptyState, StateBadge, GasDot, formatCapacidad } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'

export default function CamionesPage() {
  const [camiones, setCamiones] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  // Modales
  const [modalForm, setModalForm] = useState(false)
  const [modalStock, setModalStock] = useState(false)
  const [modalCargar, setModalCargar] = useState(false)

  // Datos para formularios/acciones
  const [selectedCamion, setSelectedCamion] = useState(null)
  const [form, setForm] = useState({ id: '', placa: '', capacidadMax: 10, activo: true })
  
  // Detalle de stock
  const [stockTubos, setStockTubos] = useState([])
  const [loadingStock, setLoadingStock] = useState(false)
  const [selectedStockIds, setSelectedStockIds] = useState([])

  // Carga de tubos
  const [tubosDisponibles, setTubosDisponibles] = useState([])
  const [loadingDisponibles, setLoadingDisponibles] = useState(false)
  const [selectedDisponiblesIds, setSelectedDisponiblesIds] = useState([])

  const loadCamiones = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/camiones')
      setCamiones(res.data)
    } catch {
      toast('Error al cargar la lista de camiones', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCamiones()
  }, [loadCamiones])

  // Crear/Editar camión
  const handleOpenForm = (camion = null) => {
    if (camion) {
      setForm({
        id: camion.id,
        placa: camion.placa,
        capacidadMax: camion.capacidadMax,
        activo: camion.activo,
      })
    } else {
      setForm({ id: '', placa: '', capacidadMax: 10, activo: true })
    }
    setModalForm(true)
  }

  const handleSaveCamion = async (e) => {
    e.preventDefault()
    if (!form.placa.trim()) return toast('La placa/patente es requerida', 'error')
    if (form.capacidadMax <= 0) return toast('La capacidad debe ser mayor a 0', 'error')

    setSaving(true)
    try {
      if (form.id) {
        await api.patch(`/camiones/${form.id}`, form)
        toast('Camión actualizado con éxito', 'success')
      } else {
        await api.post('/camiones', form)
        toast('Camión registrado con éxito', 'success')
      }
      setModalForm(false)
      loadCamiones()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al guardar camión', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Ver Stock del Camión
  const handleOpenStock = async (camion) => {
    setSelectedCamion(camion)
    setStockTubos([])
    setSelectedStockIds([])
    setModalStock(true)
    setLoadingStock(true)
    try {
      const res = await api.get(`/camiones/${camion.id}/stock`)
      setStockTubos(res.data)
    } catch {
      toast('Error al cargar stock del camión', 'error')
    } finally {
      setLoadingStock(false)
    }
  };

  const handleToggleStockSelect = (tuboId) => {
    setSelectedStockIds(prev => 
      prev.includes(tuboId) ? prev.filter(id => id !== tuboId) : [...prev, tuboId]
    )
  }

  const handleLiberarTubos = async () => {
    if (selectedStockIds.length === 0) return toast('Selecciona al menos un tubo para descargar', 'error')
    setSaving(true)
    try {
      await api.post(`/camiones/${selectedCamion.id}/liberar`, { tubosIds: selectedStockIds })
      toast(`Se descargaron ${selectedStockIds.length} tubos del camión`, 'success')
      
      // Recargar stock y lista general
      setSelectedStockIds([])
      const res = await api.get(`/camiones/${selectedCamion.id}/stock`)
      setStockTubos(res.data)
      loadCamiones()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al descargar tubos del camión', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Cargar / Asignar Tubos al Camión
  const handleOpenCargar = async (camion) => {
    setSelectedCamion(camion)
    setTubosDisponibles([])
    setSelectedDisponiblesIds([])
    setModalCargar(true)
    setLoadingDisponibles(true)
    try {
      // Obtener tubos que están en depósito/disponibles (no asignados a camiones y no entregados)
      const res = await api.get('/tubos', { params: { limit: 100 } })
      // Filtrar tubos elegibles: activos, sin camionId, y estados correspondientes (excluyendo de terceros)
      const elegibles = res.data.tubos.filter(t => 
        t.activo && 
        !t.camionId && 
        !t.id.startsWith('CLI_') && 
        !t.id.startsWith('CLI-') &&
        !(t._count?.recambiosComoEntregado > 0) &&
        ['DISPONIBLE', 'CARGADO', 'VACIO', 'DEVUELTO', 'EN_REVISION'].includes(t.estado)
      )
      setTubosDisponibles(elegibles)
    } catch {
      toast('Error al buscar tubos disponibles en depósito', 'error')
    } finally {
      setLoadingDisponibles(false)
    }
  }

  const handleToggleDisponibleSelect = (tuboId) => {
    setSelectedDisponiblesIds(prev => 
      prev.includes(tuboId) ? prev.filter(id => id !== tuboId) : [...prev, tuboId]
    )
  }

  const handleAsignarTubos = async () => {
    if (selectedDisponiblesIds.length === 0) return toast('Selecciona al menos un tubo para cargar', 'error')
    
    const capacidadDisponible = selectedCamion.capacidadMax - (selectedCamion._count?.tubos || 0)
    if (selectedDisponiblesIds.length > capacidadDisponible) {
      return toast(`No podés cargar más de la capacidad disponible (${capacidadDisponible} libres)`, 'error')
    }

    setSaving(true)
    try {
      await api.post(`/camiones/${selectedCamion.id}/asignar`, { tubosIds: selectedDisponiblesIds })
      toast(`Se cargaron ${selectedDisponiblesIds.length} tubos al camión`, 'success')
      setModalCargar(false)
      loadCamiones()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al asignar tubos al camión', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCloseStock = () => {
    setModalStock(false)
    setSelectedStockIds([])
  }

  const handleCloseCargar = () => {
    setModalCargar(false)
    setSelectedDisponiblesIds([])
  }

  return (
    <>
      <PageHeader
        title="Gestión de Camiones"
        subtitle="Administración de flota, capacidades y stock asignado en tránsito"
        actions={
          <>
            <button
              className="btn btn-sm"
              onClick={loadCamiones}
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <i className={`ti ti-refresh ${loading ? 'ti-spin' : ''}`} />
              Actualizar
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => handleOpenForm()}>
              <i className="ti ti-plus" /> Nuevo Camión
            </button>
          </>
        }
      />

      <div className="app-content">
        {loading ? (
          <Spinner />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
              {camiones.length === 0 ? (
                <EmptyState icon="ti-truck" message="No hay camiones registrados" />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Identificador / Placa</th>
                      <th>Capacidad Max</th>
                      <th>Ocupación Actual</th>
                      <th>Capacidad Libre</th>
                      <th>Estado</th>
                      <th style={{ textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {camiones.map(c => {
                      const ocupados = c._count?.tubos || 0
                      const libres = c.capacidadMax - ocupados
                      const pct = Math.min(100, Math.round((ocupados / c.capacidadMax) * 100))
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <i className="ti ti-truck" style={{ color: 'var(--text-secondary)' }} />
                              {c.placa}
                            </span>
                          </td>
                          <td style={{ fontWeight: 500 }}>{c.capacidadMax} tubos</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontWeight: 'bold', color: ocupados > 0 ? 'var(--blue)' : 'var(--text-muted)' }}>
                                {ocupados}
                              </span>
                              <div className="progress-bar-bg" style={{ width: 80, height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                                <div className="progress-bar-fg" style={{ width: `${pct}%`, height: '100%', background: pct > 85 ? 'var(--red)' : 'var(--green)' }} />
                              </div>
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pct}%</span>
                            </div>
                          </td>
                          <td style={{ color: libres === 0 ? 'var(--red)' : 'var(--text-secondary)' }}>
                            {libres} libres
                          </td>
                          <td>
                            <span className={`badge badge-${c.activo ? 'ACTIVO' : 'INACTIVO'}`}>
                              {c.activo ? 'ACTIVO' : 'INACTIVO'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn btn-sm btn-secondary" onClick={() => handleOpenStock(c)}>
                                <i className="ti ti-list" /> Stock ({ocupados})
                              </button>
                              <button className="btn btn-sm btn-secondary" onClick={() => handleOpenCargar(c)} disabled={!c.activo || libres === 0}>
                                <i className="ti ti-arrow-up-right" /> Cargar
                              </button>
                              <button className="btn btn-sm btn-secondary" onClick={() => handleOpenForm(c)}>
                                <i className="ti ti-edit" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Mobile List */}
            <div className="mobile-list">
              {camiones.length === 0 ? (
                <EmptyState icon="ti-truck" message="No hay camiones registrados" />
              ) : (
                camiones.map(c => {
                  const ocupados = c._count?.tubos || 0
                  const libres = c.capacidadMax - ocupados
                  return (
                    <div key={c.id} className="list-card">
                      <div className="list-card-header">
                        <div className="list-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="ti ti-truck" />
                          {c.placa}
                        </div>
                        <span className={`badge badge-${c.activo ? 'ACTIVO' : 'INACTIVO'}`}>
                          {c.activo ? 'ACTIVO' : 'INACTIVO'}
                        </span>
                      </div>
                      <div className="list-card-body">
                        <div className="list-card-item">
                          <span className="list-card-label">Capacidad total</span>
                          <span className="list-card-value">{c.capacidadMax} tubos</span>
                        </div>
                        <div className="list-card-item">
                          <span className="list-card-label">Ocupación</span>
                          <span className="list-card-value" style={{ fontWeight: 'bold', color: ocupados > 0 ? 'var(--blue)' : 'inherit' }}>
                            {ocupados} tubos ({libres} libres)
                          </span>
                        </div>
                      </div>
                      <div className="list-card-actions" style={{ flexWrap: 'wrap', gap: 4 }}>
                        <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => handleOpenStock(c)}>
                          <i className="ti ti-list" /> Stock
                        </button>
                        <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => handleOpenCargar(c)} disabled={!c.activo || libres === 0}>
                          <i className="ti ti-arrow-up-right" /> Cargar
                        </button>
                        <button className="btn btn-sm btn-icon" onClick={() => handleOpenForm(c)}>
                          <i className="ti ti-edit" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal Crear/Editar Camión */}
      <Modal
        open={modalForm}
        title={form.id ? 'Editar Camión' : 'Nuevo Camión'}
        onClose={() => setModalForm(false)}
        footer={
          <>
            <button className="btn" onClick={() => setModalForm(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSaveCamion} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Camión'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSaveCamion} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormGroup label="Identificador / Placa / Patente" required>
            <input
              value={form.placa}
              onChange={e => setForm(p => ({ ...p, placa: e.target.value.toUpperCase() }))}
              placeholder="Ej: ABC-123 o PLACA-01"
              required
            />
          </FormGroup>

          <FormGroup label="Capacidad Máxima (Cilindros)" required>
            <input
              type="number"
              min="1"
              value={form.capacidadMax}
              onChange={e => setForm(p => ({ ...p, capacidadMax: parseInt(e.target.value, 10) || 0 }))}
              required
            />
          </FormGroup>

          {form.id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <input
                type="checkbox"
                id="activo"
                checked={form.activo}
                onChange={e => setForm(p => ({ ...p, activo: e.target.checked }))}
              />
              <label htmlFor="activo" style={{ fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Camión activo y disponible para reparto</label>
            </div>
          )}
        </form>
      </Modal>

      {/* Modal Ver Stock (Detalles / Descarga) */}
      <Modal
        open={modalStock}
        title={`Stock del Camión: ${selectedCamion?.placa}`}
        onClose={handleCloseStock}
        width={720}
        footer={
          <>
            <button type="button" className="btn" onClick={handleCloseStock}>Cerrar</button>
            {selectedStockIds.length > 0 && (
              <button type="button" className="btn btn-danger" onClick={handleLiberarTubos} disabled={saving}>
                {saving ? 'Descargando...' : `Descargar de camión (${selectedStockIds.length})`}
              </button>
            )}
          </>
        }
      >
        {loadingStock ? (
          <Spinner />
        ) : stockTubos.length === 0 ? (
          <EmptyState icon="ti-cylinder" message="El stock del camión está vacío" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Seleccioná los tubos que querés retornar al stock del depósito (vacíos, sobrantes de ruta, etc.):
            </p>
            <div className="table-wrap" style={{ padding: 0, maxHeight: 300, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input 
                        type="checkbox" 
                        checked={selectedStockIds.length === stockTubos.length} 
                        onChange={() => {
                          if (selectedStockIds.length === stockTubos.length) {
                            setSelectedStockIds([])
                          } else {
                            setSelectedStockIds(stockTubos.map(t => t.id))
                          }
                        }}
                      />
                    </th>
                    <th>Código Tubo</th>
                    <th>Gas</th>
                    <th>Capacidad</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {stockTubos.map(t => (
                    <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => handleToggleStockSelect(t.id)}>
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedStockIds.includes(t.id)}
                          onChange={() => handleToggleStockSelect(t.id)}
                        />
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 'bold' }}>{t.id}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <GasDot gas={t.gas} /> {t.gas}
                        </span>
                      </td>
                      <td>{formatCapacidad(t)}</td>
                      <td><StateBadge estado={t.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Cargar / Asignar Tubos */}
      <Modal
        open={modalCargar}
        title={`Cargar Tubos al Camión: ${selectedCamion?.placa}`}
        onClose={handleCloseCargar}
        width={720}
        footer={
          <>
            <button type="button" className="btn" onClick={handleCloseCargar}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={handleAsignarTubos} disabled={saving || selectedDisponiblesIds.length === 0}>
              {saving ? 'Cargando...' : `Cargar al camión (${selectedDisponiblesIds.length})`}
            </button>
          </>
        }
      >
        {loadingDisponibles ? (
          <Spinner />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedCamion && (
              <div style={{ background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Capacidad del Camión:</span>
                <span style={{ fontSize: 13, fontWeight: 'bold' }}>
                  {(selectedCamion._count?.tubos || 0) + selectedDisponiblesIds.length} / {selectedCamion.capacidadMax} cilindros
                </span>
              </div>
            )}

            {selectedCamion && (selectedCamion._count?.tubos || 0) + selectedDisponiblesIds.length > selectedCamion.capacidadMax && (
              <div style={{ background: 'var(--red-light)', color: 'var(--red)', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
                ⚠️ Has seleccionado más cilindros de la capacidad que le queda al camión. Por favor, desmarca algunos.
              </div>
            )}

            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Seleccioná los cilindros disponibles en el depósito para subirlos al stock de este camión:
            </p>

            {tubosDisponibles.length === 0 ? (
              <EmptyState icon="ti-cylinder" message="No hay tubos libres cargados o disponibles en el depósito" />
            ) : (
              <div className="table-wrap" style={{ padding: 0, maxHeight: 300, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }} />
                      <th>Código Tubo</th>
                      <th>Gas</th>
                      <th>Capacidad</th>
                      <th>Estado</th>
                      <th>Ubicación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tubosDisponibles.map(t => {
                      const isChecked = selectedDisponiblesIds.includes(t.id)
                      const ocupacionFutura = (selectedCamion?._count?.tubos || 0) + selectedDisponiblesIds.length
                      const superariaCapacidad = !isChecked && (ocupacionFutura >= (selectedCamion?.capacidadMax || 0))
                      return (
                        <tr 
                          key={t.id} 
                          style={{ cursor: superariaCapacidad ? 'not-allowed' : 'pointer', opacity: superariaCapacidad ? 0.6 : 1 }} 
                          onClick={() => {
                            if (!superariaCapacidad || isChecked) {
                              handleToggleDisponibleSelect(t.id)
                            }
                          }}
                        >
                          <td onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={superariaCapacidad}
                              onChange={() => handleToggleDisponibleSelect(t.id)}
                            />
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 'bold' }}>{t.id}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <GasDot gas={t.gas} /> {t.gas}
                            </span>
                          </td>
                          <td>{formatCapacidad(t)}</td>
                          <td><StateBadge estado={t.estado} /></td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{t.ubicacion || 'Depósito'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
