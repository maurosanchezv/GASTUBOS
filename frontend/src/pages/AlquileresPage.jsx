// gastubos/frontend/src/pages/AlquileresPage.jsx
import { Fragment, useEffect, useState } from 'react'
import api from '../services/api.js'
import { PageHeader, Spinner, EmptyState, Modal, FormGroup, useToast } from '../components/ui.jsx'
import { useAuthStore } from '../store/authStore.js'

const NIVEL_ALERTA = {
  normal:    { color: 'var(--text-secondary)', label: null },
  proximo7:  { color: 'var(--amber)', label: 'Vence pronto' },
  proximo3:  { color: 'var(--coral)', label: 'Vence en pocos días' },
  hoy:       { color: 'var(--red)',   label: 'Vence hoy' },
  vencido:   { color: 'var(--red)',   label: 'Vencido' },
}

const gs = (val) => Number(val || 0).toLocaleString('es-PY') + ' Gs'
const fecha = (val) => val ? new Date(val).toLocaleDateString('es-PY') : '—'

export default function AlquileresPage() {
  const { user } = useAuthStore()
  const { toast } = useToast()
  const puedeGestionar = ['ADMIN', 'SUPERVISOR'].includes(user?.rol)

  const [alquileres, setAlquileres] = useState([])
  const [indicadores, setIndicadores] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [generando, setGenerando] = useState(false)

  const [detalle, setDetalle] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  const [modalPago, setModalPago] = useState(null) // { alquilerId, cargo }
  const [cargosExpandidos, setCargosExpandidos] = useState(new Set())
  const [formPago, setFormPago] = useState({ montoPagado: '', metodoPago: 'EFECTIVO' })
  const [guardandoPago, setGuardandoPago] = useState(false)

  const [modalRecarga, setModalRecarga] = useState(false)
  const [formRecarga, setFormRecarga] = useState({ tipoServicio: 'RECARGA_MISMO_TUBO', fechaProgramada: '', observaciones: '' })
  const [solicitandoRecarga, setSolicitandoRecarga] = useState(false)

  const load = async () => {
    try {
      const [rLista, rInd] = await Promise.all([
        api.get('/alquileres'),
        api.get('/alquileres/indicadores'),
      ])
      setAlquileres(rLista.data)
      setIndicadores(rInd.data)
    } catch (err) {
      toast('Error al cargar alquileres', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const lista = alquileres.filter(a => {
    if (filtro === 'activos')            return a.estado === 'ACTIVO'
    if (filtro === 'pendiente_entrega')  return a.estado === 'PENDIENTE_ENTREGA'
    if (filtro === 'vencidos')           return a.estadoFinanciero === 'VENCIDO'
    if (filtro === 'finalizados')        return ['FINALIZADO', 'CANCELADO'].includes(a.estado)
    return true
  })

  async function abrirDetalle(id) {
    setCargandoDetalle(true)
    setDetalle({ id }) // abre el modal ya, con spinner adentro
    try {
      const r = await api.get(`/alquileres/${id}`)
      setDetalle(r.data)
    } catch (err) {
      toast('Error al cargar el detalle del contrato', 'error')
      setDetalle(null)
    } finally {
      setCargandoDetalle(false)
    }
  }

  async function generarMensualidades() {
    setGenerando(true)
    try {
      const r = await api.post('/alquileres/generar-mensualidades')
      const { mensualidadesCreadas } = r.data
      toast(
        mensualidadesCreadas > 0
          ? `${mensualidadesCreadas} mensualidad(es) generada(s)`
          : 'No había mensualidades pendientes de generar',
        'success'
      )
      load()
      if (detalle?.id) abrirDetalle(detalle.id)
    } catch (err) {
      toast(err.response?.data?.error || 'Error al generar mensualidades', 'error')
    } finally {
      setGenerando(false)
    }
  }

  function toggleCargoExpandido(cargoId) {
    setCargosExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(cargoId)) next.delete(cargoId)
      else next.add(cargoId)
      return next
    })
  }

  function abrirPago(alquilerId, cargo) {
    const saldo = Number(cargo.monto) - Number(cargo.montoPagado)
    setFormPago({ montoPagado: saldo, metodoPago: 'EFECTIVO' })
    setModalPago({ alquilerId, cargo })
  }

  async function confirmarPago(e) {
    e.preventDefault()
    if (!formPago.montoPagado || Number(formPago.montoPagado) <= 0) {
      return toast('Ingresá un monto válido', 'error')
    }
    setGuardandoPago(true)
    try {
      await api.post(`/alquileres/${modalPago.alquilerId}/cargos/${modalPago.cargo.id}/pagar`, {
        montoPagado: Number(formPago.montoPagado),
        metodoPago: formPago.metodoPago,
      })
      toast('Pago registrado correctamente', 'success')
      setModalPago(null)
      load()
      if (detalle?.id === modalPago.alquilerId) abrirDetalle(modalPago.alquilerId)
    } catch (err) {
      toast(err.response?.data?.error || 'Error al registrar el pago', 'error')
    } finally {
      setGuardandoPago(false)
    }
  }

  async function anularCargoDetalle(alquilerId, cargo) {
    const motivo = window.prompt(`Anular cargo ${cargo.tipo.replace(/_/g, ' ')} de Gs. ${gs(cargo.monto)}. Motivo:`)
    if (motivo === null) return
    try {
      await api.post(`/alquileres/${alquilerId}/cargos/${cargo.id}/anular`, { motivo })
      toast('Cargo anulado', 'success')
      load()
      abrirDetalle(alquilerId)
    } catch (err) {
      toast(err.response?.data?.error || 'Error al anular el cargo', 'error')
    }
  }

  function abrirModalRecarga() {
    setFormRecarga({ tipoServicio: 'RECARGA_MISMO_TUBO', fechaProgramada: '', observaciones: '' })
    setModalRecarga(true)
  }

  async function confirmarSolicitudRecarga(e) {
    e.preventDefault()
    setSolicitandoRecarga(true)
    try {
      await api.post('/recargas-alquiler', {
        alquilerId: detalle.id,
        tipoServicio: formRecarga.tipoServicio,
        fechaProgramada: formRecarga.fechaProgramada ? new Date(formRecarga.fechaProgramada).toISOString() : undefined,
        observaciones: formRecarga.observaciones || undefined,
      })
      toast('Recarga solicitada correctamente', 'success')
      setModalRecarga(false)
      abrirDetalle(detalle.id)
    } catch (err) {
      toast(err.response?.data?.error || 'Error al solicitar la recarga', 'error')
    } finally {
      setSolicitandoRecarga(false)
    }
  }

  async function registrarDevolucion(alquiler) {
    if (!window.confirm(`¿Registrar la devolución del tubo ${alquiler.tuboId} del contrato ${alquiler.numero}? Esto finaliza el contrato.`)) return
    try {
      await api.post('/devoluciones', { tuboId: alquiler.tuboId, estadoDestino: 'DEVUELTO' })
      toast('Devolución registrada. Contrato finalizado.', 'success')
      load()
      if (detalle?.id === alquiler.id) abrirDetalle(alquiler.id)
    } catch (err) {
      toast(err.response?.data?.error || 'Error al registrar la devolución', 'error')
    }
  }

  const tabs = [
    ['todos', 'Todos'],
    ['activos', 'Activos'],
    ['pendiente_entrega', 'Pendiente entrega'],
    ['vencidos', 'Vencidos'],
    ['finalizados', 'Finalizados'],
  ]

  return (
    <>
      <PageHeader
        title="Alquileres"
        subtitle="Panel de gestión de contratos de alquiler de equipos"
        actions={puedeGestionar && (
          <button className="btn btn-sm" onClick={generarMensualidades} disabled={generando}>
            <i className={`ti ${generando ? 'ti-spin ti-refresh' : 'ti-refresh'}`} />
            {generando ? 'Generando...' : 'Generar mensualidades'}
          </button>
        )}
      />
      <div className="app-content">
        {indicadores && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
            <div className="stat-card">
              <div className="stat-label"><i className="ti ti-file-check" aria-hidden /> Activos</div>
              <div className="stat-value stat-blue">{indicadores.activos}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><i className="ti ti-clock-exclamation" aria-hidden /> Próximos a cobrar</div>
              <div className="stat-value stat-amber">{indicadores.proximosAVencer}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><i className="ti ti-alert-triangle" aria-hidden /> Mensualidades vencidas</div>
              <div className="stat-value stat-red">{indicadores.mensualidadesVencidas}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><i className="ti ti-cash" aria-hidden /> Saldo pendiente</div>
              <div className="stat-value stat-red">{gs(indicadores.saldoTotalPendiente)}</div>
            </div>
          </div>
        )}

        <div className="tabs">
          {tabs.map(([v, l]) => (
            <div key={v} className={`tab ${filtro === v ? 'active' : ''}`} onClick={() => setFiltro(v)}>{l}</div>
          ))}
        </div>

        {loading ? <Spinner /> : (
          <div className="card" style={{ padding: 0 }}>
            {lista.length === 0 ? <EmptyState icon="ti-calendar-time" message="Sin alquileres en este filtro" /> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nro</th><th>Cliente</th><th>Plan</th><th>Tubo</th><th>Inicio</th>
                      <th>Próximo cobro</th><th>Mensualidad</th><th>Saldo</th>
                      <th>Contrato</th><th>Financiero</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map(a => {
                      const alerta = NIVEL_ALERTA[a.nivelAlerta] || NIVEL_ALERTA.normal
                      return (
                        <tr key={a.id}>
                          <td className="td-code" style={{ cursor: 'pointer' }} onClick={() => abrirDetalle(a.id)}>{a.numero}</td>
                          <td style={{ fontWeight: 500 }}>{a.cliente?.nombre}</td>
                          <td>{a.plan?.nombre || <span style={{ color: 'var(--text-muted)' }}>Legacy</span>}</td>
                          <td className="td-code">{a.tubo?.id}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fecha(a.fechaInicio)}</td>
                          <td style={{ fontSize: 11, color: alerta.color, fontWeight: alerta.label ? 700 : 400 }} title={alerta.label || ''}>
                            {fecha(a.fechaVencimiento)}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{a.precioMensualAplicado ? gs(a.precioMensualAplicado) : '—'}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: a.saldoPendiente > 0 ? 'var(--red)' : 'inherit', fontWeight: a.saldoPendiente > 0 ? 700 : 400 }}>
                            {gs(a.saldoPendiente)}
                          </td>
                          <td><span className={`badge badge-${a.estado}`}>{a.estado.replace(/_/g, ' ')}</span></td>
                          <td><span className={`badge badge-${a.estadoFinanciero}`}>{a.estadoFinanciero.replace(/_/g, ' ')}</span></td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn-icon" title="Ver detalle" onClick={() => abrirDetalle(a.id)}>
                              <i className="ti ti-eye" />
                            </button>
                            {a.estado === 'ACTIVO' && (
                              <button className="btn-icon" title="Registrar devolución" onClick={() => registrarDevolucion(a)}>
                                <i className="ti ti-arrow-back" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de detalle del contrato */}
      <Modal
        open={!!detalle}
        title={detalle?.numero ? `Contrato ${detalle.numero}` : 'Detalle del contrato'}
        onClose={() => setDetalle(null)}
        width={680}
      >
        {cargandoDetalle || !detalle?.cliente ? <Spinner /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, fontSize: 12 }}>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>CLIENTE</div><div style={{ fontWeight: 600 }}>{detalle.cliente.nombre}</div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>PLAN</div><div style={{ fontWeight: 600 }}>{detalle.plan?.nombre || 'Legacy (sin plan)'}</div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>TUBO ACTUAL</div><div className="td-code">{detalle.tubo?.id}</div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>INICIO</div><div>{fecha(detalle.fechaInicio)}</div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>PRIMER PERÍODO HASTA</div><div>{fecha(detalle.primerPeriodoHasta)}</div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>PRÓXIMO VENCIMIENTO</div><div>{fecha(detalle.fechaVencimiento)}</div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>ESTADO CONTRATO</div><span className={`badge badge-${detalle.estado}`}>{detalle.estado.replace(/_/g, ' ')}</span></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>ESTADO FINANCIERO</div><span className={`badge badge-${detalle.estadoFinanciero}`}>{detalle.estadoFinanciero.replace(/_/g, ' ')}</span></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>SALDO PENDIENTE</div><div style={{ fontWeight: 700, color: detalle.saldoPendiente > 0 ? 'var(--red)' : 'var(--green)' }}>{gs(detalle.saldoPendiente)}</div></div>
              {detalle.entrega && (
                <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>ENTREGA ORIGEN</div><div className="td-code">{detalle.entrega.numero}</div></div>
              )}
            </div>

            <div>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Historial financiero</div>
              {detalle.cargos.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin cargos generados todavía.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th></th><th>Fecha</th><th>Concepto</th><th>Período</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
                    <tbody>
                      {detalle.cargos.map(c => {
                        const tienePagos = (c.pagos || []).length > 0
                        const expandido = cargosExpandidos.has(c.id)
                        return (
                          <Fragment key={c.id}>
                            <tr>
                              <td style={{ width: 24 }}>
                                {tienePagos && (
                                  <button className="btn-icon" title="Ver pagos" onClick={() => toggleCargoExpandido(c.id)}>
                                    <i className={`ti ${expandido ? 'ti-chevron-down' : 'ti-chevron-right'}`} />
                                  </button>
                                )}
                              </td>
                              <td style={{ fontSize: 11 }}>{fecha(c.fechaEmision)}</td>
                              <td style={{ fontSize: 12 }}>{c.tipo.replace(/_/g, ' ')}</td>
                              <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fecha(c.periodoDesde)} → {fecha(c.periodoHasta)}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                                {gs(c.montoPagado)} / {gs(c.monto)}
                              </td>
                              <td><span className={`badge badge-${c.estado}`}>{c.estado}</span></td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {['PENDIENTE', 'PARCIAL', 'VENCIDO'].includes(c.estado) && (
                                  <button className="btn btn-sm btn-primary" onClick={() => abrirPago(detalle.id, c)}>Registrar pago</button>
                                )}
                                {c.estado !== 'ANULADO' && !tienePagos && (
                                  <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => anularCargoDetalle(detalle.id, c)}>Anular</button>
                                )}
                              </td>
                            </tr>
                            {expandido && tienePagos && (
                              <tr key={`${c.id}-pagos`}>
                                <td></td>
                                <td colSpan={6} style={{ padding: '4px 8px 12px' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>PAGOS</div>
                                  <table style={{ width: '100%' }}>
                                    <tbody>
                                      {c.pagos.map(p => (
                                        <tr key={p.id}>
                                          <td style={{ fontSize: 11, padding: '3px 6px' }}>{fecha(p.fechaPago)}</td>
                                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '3px 6px' }}>{gs(p.monto)}</td>
                                          <td style={{ fontSize: 11, padding: '3px 6px' }}>{p.metodoPago}</td>
                                          <td style={{ fontSize: 11, color: 'var(--text-muted)', padding: '3px 6px' }}>{p.usuario?.nombre || p.usuario?.username || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {detalle.tubosHistorial?.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Historial de tubos</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detalle.tubosHistorial.map(h => (
                    <div key={h.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
                      padding: '8px 10px', borderRadius: 8,
                      background: h.activo ? 'var(--surface-2, #f5f5f5)' : 'transparent',
                      border: '1px solid var(--border)',
                    }}>
                      <span className="td-code" style={{ fontWeight: 700 }}>{h.tuboId}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {fecha(h.fechaDesde)} → {h.activo ? 'Actual' : fecha(h.fechaHasta)}
                      </span>
                      <span className="badge badge-tipo-ALQUILER" style={{ marginLeft: 'auto' }}>
                        {h.motivoAsignacion.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detalle.ordenesRecarga?.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Servicios</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Fecha</th><th>Tipo</th><th>Tubo</th><th>Monto</th><th>Estado</th><th>Repartidor</th></tr></thead>
                    <tbody>
                      {detalle.ordenesRecarga.map(o => (
                        <tr key={o.id}>
                          <td style={{ fontSize: 11 }}>{fecha(o.fechaFinalizacion || o.fechaSolicitud)}</td>
                          <td style={{ fontSize: 12 }}>
                            {o.tipoServicio === 'RECAMBIO_TUBO'
                              ? `RECAMBIO: ${o.tubo?.id}${o.tuboNuevo ? ` → ${o.tuboNuevo.id}` : ''}`
                              : `RECARGA MISMO TUBO: ${o.tubo?.id}`}
                          </td>
                          <td className="td-code">{o.numero}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{gs(o.precioAplicado)}</td>
                          <td><span className={`badge badge-${o.estado === 'COMPLETADA' ? 'ACTIVO' : o.estado === 'CANCELADA' ? 'CANCELADO' : 'PENDIENTE'}`}>{o.estado.replace(/_/g, ' ')}</span></td>
                          <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{o.repartidor?.nombre || o.repartidor?.username || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detalle.estado === 'ACTIVO' && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={abrirModalRecarga}>
                  <i className="ti ti-truck-delivery" /> Solicitar recarga
                </button>
                <button className="btn" onClick={() => registrarDevolucion(detalle)}>
                  <i className="ti ti-arrow-back" /> Registrar devolución / finalizar
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal de solicitar recarga */}
      <Modal
        open={modalRecarga}
        title="Solicitar recarga"
        onClose={() => setModalRecarga(false)}
        footer={
          <>
            <button className="btn" onClick={() => setModalRecarga(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmarSolicitudRecarga} disabled={solicitandoRecarga}>
              {solicitandoRecarga ? 'Solicitando...' : 'Solicitar'}
            </button>
          </>
        }
      >
        {detalle && (
          <form onSubmit={confirmarSolicitudRecarga} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, fontSize: 12 }}>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>CLIENTE</div><div style={{ fontWeight: 600 }}>{detalle.cliente?.nombre}</div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>CONTRATO</div><div className="td-code">{detalle.numero}</div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>PLAN</div><div>{detalle.plan?.nombre || '—'}</div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>TUBO ACTUAL</div><div className="td-code">{detalle.tubo?.id}</div></div>
              <div style={{ gridColumn: '1 / -1' }}><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>DIRECCIÓN</div><div>{detalle.entrega?.direccionEntrega || detalle.cliente?.direccion || '—'}</div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>PRECIO RECARGA</div><div style={{ fontWeight: 700 }}>{gs(detalle.precioRecargaAplicado)}</div></div>
            </div>

            <FormGroup label="Tipo de servicio" required>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name="tipoServicio" checked={formRecarga.tipoServicio === 'RECARGA_MISMO_TUBO'}
                    onChange={() => setFormRecarga(f => ({ ...f, tipoServicio: 'RECARGA_MISMO_TUBO' }))} />
                  Recarga del mismo tubo
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name="tipoServicio" checked={formRecarga.tipoServicio === 'RECAMBIO_TUBO'}
                    onChange={() => setFormRecarga(f => ({ ...f, tipoServicio: 'RECAMBIO_TUBO' }))} />
                  Recambio de tubo
                </label>
              </div>
            </FormGroup>

            <FormGroup label="Fecha programada (opcional)">
              <input type="date" value={formRecarga.fechaProgramada} onChange={e => setFormRecarga(f => ({ ...f, fechaProgramada: e.target.value }))} />
            </FormGroup>

            <FormGroup label="Observaciones (opcional)">
              <textarea value={formRecarga.observaciones} onChange={e => setFormRecarga(f => ({ ...f, observaciones: e.target.value }))} style={{ height: 56 }} />
            </FormGroup>
          </form>
        )}
      </Modal>

      {/* Modal de registrar pago */}
      <Modal
        open={!!modalPago}
        title={`Registrar pago — ${modalPago?.cargo?.tipo?.replace(/_/g, ' ') || ''}`}
        onClose={() => setModalPago(null)}
        footer={
          <>
            <button className="btn" onClick={() => setModalPago(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmarPago} disabled={guardandoPago}>
              {guardandoPago ? 'Guardando...' : 'Confirmar pago'}
            </button>
          </>
        }
      >
        {modalPago && (
          <form onSubmit={confirmarPago} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Monto del cargo: <strong>{gs(modalPago.cargo.monto)}</strong> — ya pagado: <strong>{gs(modalPago.cargo.montoPagado)}</strong>
            </div>
            <FormGroup label="Monto a pagar (Gs)" required>
              <input type="number" min="1" value={formPago.montoPagado} onChange={e => setFormPago(f => ({ ...f, montoPagado: e.target.value }))} required />
            </FormGroup>
            <FormGroup label="Forma de pago" required>
              <select value={formPago.metodoPago} onChange={e => setFormPago(f => ({ ...f, metodoPago: e.target.value }))} required>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
            </FormGroup>
          </form>
        )}
      </Modal>
    </>
  )
}
