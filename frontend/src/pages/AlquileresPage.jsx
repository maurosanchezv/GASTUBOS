// gastubos/frontend/src/pages/AlquileresPage.jsx
import { Fragment, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../services/api.js'
import { PageHeader, Spinner, EmptyState, Modal, FormGroup, useToast } from '../components/ui.jsx'
import { useConfigStore } from '../store/configStore.js'
import { getBrandingSources } from '../utils/logosSvg.js'
import { construirBufferTicketReciboAlquiler } from '../utils/ticketsImpresion.js'
import { conectarImpresoraWebBluetooth, enviarBufferWebBluetooth, esNavegadorMovilConWebBluetooth } from '../utils/webBluetoothPrinter.js'
import ReciboAlquilerTicket from '../components/ReciboAlquilerTicket.jsx'

const NIVEL_ALERTA = {
  normal:    { color: 'var(--text-secondary)', label: null },
  proximo7:  { color: 'var(--amber)', label: 'Vence pronto' },
  proximo3:  { color: 'var(--coral)', label: 'Vence en pocos días' },
  hoy:       { color: 'var(--red)',   label: 'Vence hoy' },
  vencido:   { color: 'var(--red)',   label: 'Vencido' },
}

const gs = (val) => Number(val || 0).toLocaleString('es-PY') + ' Gs'
const fecha = (val) => val ? new Date(val).toLocaleDateString('es-PY') : '—'

// Etiqueta legible del concepto de un cargo, para el recibo de pago.
const CONCEPTO_LABEL = {
  INICIAL: 'Pago inicial de alquiler',
  MENSUALIDAD: 'Mensualidad de alquiler',
  RECARGA_DOMICILIO: 'Recarga a domicilio',
  OTRO: 'Otro concepto',
}

function conceptoLabel(c) {
  return c.esDelivery ? 'Delivery' : (CONCEPTO_LABEL[c.tipo] || c.tipo.replace(/_/g, ' '))
}

// Agrupa visualmente el cargo INICIAL con su cargo de delivery (c.esDelivery,
// ver backend/utils/alquilerCargos.js) de la misma entrega en una sola fila
// combinada — puramente de presentación, cada cargo real sigue existiendo por
// separado y se paga/anula individualmente (ver el desglose expandido). No
// todo INICIAL tiene un delivery: en una entrega con varios tubos, el costo
// de delivery se cobra una sola vez, contra un solo contrato.
function agruparCargos(cargos) {
  const deliverys = cargos.filter(c => c.esDelivery)
  const deliveryUsado = new Set()
  const items = cargos
    .filter(c => !c.esDelivery)
    .map(c => {
      if (c.tipo !== 'INICIAL') return { tipo: 'simple', cargo: c }
      const delivery = deliverys.find(d => d.alquilerId === c.alquilerId)
      if (!delivery) return { tipo: 'simple', cargo: c }
      deliveryUsado.add(delivery.id)
      return { tipo: 'combinado', inicial: c, delivery }
    })
  // Un delivery sin su INICIAL correspondiente (no debería pasar en la
  // práctica) no se pierde: se muestra suelto en vez de quedar oculto.
  for (const d of deliverys) {
    if (!deliveryUsado.has(d.id)) items.push({ tipo: 'simple', cargo: d })
  }
  return items
}

export default function AlquileresPage() {
  const { toast } = useToast()
  const { nombre_empresa, direccion, telefono, isotipo_empresa, logo_empresa } = useConfigStore()
  const branding = getBrandingSources(isotipo_empresa, logo_empresa)

  const [alquileres, setAlquileres] = useState([])
  const [indicadores, setIndicadores] = useState(null)
  const [cobranza, setCobranza] = useState([]) // contratos con plata a cobrar ahora (panel derecho)
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')

  const [detalle, setDetalle] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  const [modalPago, setModalPago] = useState(null) // { alquilerId, cargo }
  const [cargosExpandidos, setCargosExpandidos] = useState(new Set())
  const [formPago, setFormPago] = useState({ montoPagado: '', metodoPago: 'EFECTIVO' })
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [reciboPago, setReciboPago] = useState(null) // { cargo, pago, alquiler, cobradoPor } tras un pago exitoso

  const [modalRecarga, setModalRecarga] = useState(false)
  const [formRecarga, setFormRecarga] = useState({ tipoServicio: 'RECARGA_MISMO_TUBO', repartidorId: '', camionId: '', fechaProgramada: '', observaciones: '' })
  const [solicitandoRecarga, setSolicitandoRecarga] = useState(false)
  const [repartidores, setRepartidores] = useState([])
  const [camiones, setCamiones] = useState([])

  const load = async () => {
    try {
      const [rLista, rInd, rCob] = await Promise.all([
        api.get('/alquileres'),
        api.get('/alquileres/indicadores'),
        api.get('/alquileres/cobranza'),
      ])
      setAlquileres(rLista.data)
      setIndicadores(rInd.data)
      setCobranza(rCob.data.porCobrar || [])
    } catch (err) {
      toast('Error al cargar alquileres', 'error')
    } finally {
      setLoading(false)
    }
    // Catálogos para asignar el chofer al solicitar una recarga — si fallan
    // (permisos, red), el modal simplemente no ofrece opciones.
    try {
      const [rReps, rCam] = await Promise.all([
        api.get('/usuarios/repartidores'),
        api.get('/camiones'),
      ])
      setRepartidores(rReps.data)
      setCamiones(rCam.data)
    } catch { /* opcional */ }
  }

  useEffect(() => { load() }, [])

  const lista = alquileres.filter(a => {
    if (filtro === 'activos')            return a.estado === 'ACTIVO'
    if (filtro === 'pendiente_entrega')  return a.estado === 'PENDIENTE_ENTREGA'
    if (filtro === 'por_vencer')         return a.estadoFinanciero === 'PROXIMO_VENCIMIENTO'
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

  function toggleCargoExpandido(cargoId) {
    setCargosExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(cargoId)) next.delete(cargoId)
      else next.add(cargoId)
      return next
    })
  }

  // `cargos`: 1 cargo suelto, o [inicial, delivery] para la fila combinada —
  // en ese caso el pago se reparte entre ambos (primero el inicial, el resto
  // al delivery), con 1 o 2 llamadas a la API según haga falta.
  function abrirPago(alquilerId, cargos) {
    const saldo = cargos.reduce((s, c) => s + (Number(c.monto) - Number(c.montoPagado)), 0)
    setFormPago({ montoPagado: saldo, metodoPago: 'EFECTIVO' })
    setModalPago({ alquilerId, cargos })
  }

  // Reimprime el recibo de un cargo (o de un par inicial+delivery combinado)
  // ya cobrado, desde el historial financiero del contrato. Une los pagos de
  // cada cargo en una línea propia del recibo — mismo objeto que deja un pago
  // recién hecho, para que la vista previa/impresión sea siempre la misma.
  function imprimirRecibo(cargos) {
    const conPagos = cargos.filter(c => (c.pagos || []).length > 0)
    if (conPagos.length === 0) return
    let totalAbonado = 0
    let ultimaFecha = null
    let cobradoPor = null
    let metodoPago = null
    let metodosDistintos = false
    const lineas = []
    for (const c of conPagos) {
      const pagos = c.pagos || []
      const sub = pagos.reduce((s, p) => s + Number(p.monto), 0)
      totalAbonado += sub
      const ultimo = pagos[pagos.length - 1]
      const metodoDeEste = pagos.length > 1 ? 'Varios' : ultimo.metodoPago
      if (!ultimaFecha || new Date(ultimo.fechaPago) > new Date(ultimaFecha)) {
        ultimaFecha = ultimo.fechaPago
        cobradoPor = ultimo.usuario?.nombre || ultimo.usuario?.username || null
      }
      if (metodoPago === null) metodoPago = metodoDeEste
      else if (metodoPago !== metodoDeEste) metodosDistintos = true
      lineas.push({ concepto: conceptoLabel(c), periodo: c.esDelivery ? null : { desde: c.periodoDesde, hasta: c.periodoHasta }, monto: sub })
    }
    const saldoTotal = cargos.reduce((s, c) => s + (Number(c.monto) - Number(c.montoPagado)), 0)
    setReciboPago({
      alquiler: { numero: detalle.numero, cliente: detalle.cliente, plan: detalle.plan },
      cobradoPor,
      fechaPago: ultimaFecha,
      metodoPago: metodosDistintos ? 'Varios' : metodoPago,
      lineas,
      totalAbonado,
      saldoTotal: Math.max(0, saldoTotal),
    })
  }

  // Impresión del recibo: en el celular manda a la térmica por Web Bluetooth
  // (igual que el ticket de Entregas); en PC usa el diálogo del navegador.
  async function handleImprimirRecibo() {
    if (!reciboPago) return
    if (esNavegadorMovilConWebBluetooth()) {
      try {
        const config = { branding, nombreEmpresa: nombre_empresa, direccion, telefono, paperWidth: 32 }
        const buffer = await construirBufferTicketReciboAlquiler(reciboPago, config)
        const conexion = await conectarImpresoraWebBluetooth()
        await enviarBufferWebBluetooth(conexion, buffer)
        toast('Impresión enviada correctamente', 'success')
      } catch (err) {
        if (err?.name !== 'NotFoundError') {
          toast('Error al imprimir: ' + (err?.message || String(err)), 'error')
        }
      }
    } else {
      window.print()
    }
  }

  async function confirmarPago(e) {
    e.preventDefault()
    const montoTotal = Number(formPago.montoPagado)
    if (!montoTotal || montoTotal <= 0) {
      return toast('Ingresá un monto válido', 'error')
    }
    const { alquilerId, cargos } = modalPago
    const saldoCombinado = cargos.reduce((s, c) => s + (Number(c.monto) - Number(c.montoPagado)), 0)
    if (montoTotal > saldoCombinado) {
      return toast('El monto supera el saldo pendiente', 'error')
    }
    setGuardandoPago(true)
    try {
      // Reparte el monto entre los cargos en orden (inicial primero, el resto
      // al delivery): 1 llamada a la API si es un cargo suelto, hasta 2 si es
      // la fila combinada — cada llamada valida su propio saldo igual que hoy.
      let restante = montoTotal
      const lineas = []
      let cobradoPor = null
      let alquilerResp = null
      let fechaPagoResp = null
      for (const c of cargos) {
        const saldoCargo = Number(c.monto) - Number(c.montoPagado)
        if (saldoCargo <= 0 || restante <= 0) continue
        const aPagar = Math.min(restante, saldoCargo)
        const { data } = await api.post(`/alquileres/${alquilerId}/cargos/${c.id}/pagar`, {
          montoPagado: aPagar,
          metodoPago: formPago.metodoPago,
        })
        restante -= aPagar
        cobradoPor = data.cobradoPor
        alquilerResp = data.alquiler
        fechaPagoResp = data.pago.fechaPago
        lineas.push({ concepto: conceptoLabel(c), periodo: c.esDelivery ? null : { desde: c.periodoDesde, hasta: c.periodoHasta }, monto: aPagar })
      }
      toast('Pago registrado correctamente', 'success')
      setModalPago(null)
      setReciboPago({
        alquiler: alquilerResp,
        cobradoPor,
        fechaPago: fechaPagoResp,
        metodoPago: formPago.metodoPago,
        lineas,
        totalAbonado: montoTotal,
        saldoTotal: Math.max(0, saldoCombinado - montoTotal),
      })
      load() // refresca lista, indicadores y el panel de cobranza
      if (detalle?.id === alquilerId) abrirDetalle(alquilerId)
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
    setFormRecarga({ tipoServicio: 'RECARGA_MISMO_TUBO', repartidorId: '', camionId: '', fechaProgramada: '', observaciones: '' })
    setModalRecarga(true)
  }

  async function confirmarSolicitudRecarga(e) {
    e.preventDefault()
    if (!formRecarga.repartidorId) return toast('Seleccioná el chofer que hará el servicio', 'error')
    setSolicitandoRecarga(true)
    try {
      await api.post('/recargas-alquiler', {
        alquilerId: detalle.id,
        tipoServicio: formRecarga.tipoServicio,
        repartidorId: formRecarga.repartidorId,
        camionId: formRecarga.camionId || undefined,
        // 'T12:00:00' (mediodía local) para que ninguna zona horaria mueva la
        // fecha elegida al día anterior/siguiente al convertir a ISO/UTC.
        fechaProgramada: formRecarga.fechaProgramada ? new Date(formRecarga.fechaProgramada + 'T12:00:00').toISOString() : undefined,
        observaciones: formRecarga.observaciones || undefined,
      })
      toast('Recarga solicitada y asignada correctamente', 'success')
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
    ['por_vencer', 'Próximos a vencer'],
    ['vencidos', 'Vencidos'],
    ['finalizados', 'Finalizados'],
  ]

  // Fila de un cargo real (con su desglose de pagos) — reusada tanto para
  // cargos sueltos como, dentro del desglose expandido, para cada uno de los
  // dos cargos reales de una fila "combinado" (ver agruparCargos arriba).
  function FilaCargo({ c }) {
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
          <td style={{ fontSize: 12 }}>{c.esDelivery ? 'DELIVERY' : c.tipo.replace(/_/g, ' ')}</td>
          <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fecha(c.periodoDesde)} → {fecha(c.periodoHasta)}</td>
          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {gs(c.montoPagado)} / {gs(c.monto)}
          </td>
          <td><span className={`badge badge-${c.estado}`}>{c.estado}</span></td>
          <td style={{ whiteSpace: 'nowrap' }}>
            {['PENDIENTE', 'PARCIAL', 'VENCIDO'].includes(c.estado) && (
              <button className="btn btn-sm btn-primary" onClick={() => abrirPago(detalle.id, [c])}>Registrar pago</button>
            )}
            {tienePagos && (
              <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => imprimirRecibo([c])} title="Imprimir recibo de este cargo">
                <i className="ti ti-printer" /> Recibo
              </button>
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
  }

  // Fila resumen "Pago inicial + delivery": solo lectura, agrupa monto/estado
  // de los dos cargos reales; las acciones viven en el desglose expandido
  // (misma mecánica de cargosExpandidos, con la clave del cargo INICIAL).
  function FilaCargoCombinado({ inicial, delivery }) {
    const expandido = cargosExpandidos.has(inicial.id)
    const monto = Number(inicial.monto) + Number(delivery.monto)
    const montoPagado = Number(inicial.montoPagado) + Number(delivery.montoPagado)
    const estados = [inicial.estado, delivery.estado]
    const estado = estados.includes('VENCIDO') ? 'VENCIDO'
      : estados.every(e => e === 'PAGADO') ? 'PAGADO'
      : estados.every(e => e === 'ANULADO') ? 'ANULADO'
      : montoPagado > 0 ? 'PARCIAL' : 'PENDIENTE'
    return (
      <Fragment key={inicial.id}>
        <tr>
          <td style={{ width: 24 }}>
            <button className="btn-icon" title="Ver desglose" onClick={() => toggleCargoExpandido(inicial.id)}>
              <i className={`ti ${expandido ? 'ti-chevron-down' : 'ti-chevron-right'}`} />
            </button>
          </td>
          <td style={{ fontSize: 11 }}>{fecha(inicial.fechaEmision)}</td>
          <td style={{ fontSize: 12 }}>Pago inicial + delivery</td>
          <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fecha(inicial.periodoDesde)} → {fecha(inicial.periodoHasta)}</td>
          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{gs(montoPagado)} / {gs(monto)}</td>
          <td><span className={`badge badge-${estado}`}>{estado}</span></td>
          <td style={{ whiteSpace: 'nowrap' }}>
            {['PENDIENTE', 'PARCIAL', 'VENCIDO'].includes(estado) && (
              <button className="btn btn-sm btn-primary" onClick={() => abrirPago(detalle.id, [inicial, delivery])}>Registrar pago</button>
            )}
            {((inicial.pagos || []).length > 0 || (delivery.pagos || []).length > 0) && (
              <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => imprimirRecibo([inicial, delivery])} title="Imprimir recibo combinado">
                <i className="ti ti-printer" /> Recibo
              </button>
            )}
          </td>
        </tr>
        {expandido && (
          <tr>
            <td></td>
            <td colSpan={6} style={{ padding: '4px 8px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>DESGLOSE</div>
              <table style={{ width: '100%' }}>
                <tbody>
                  <FilaCargo c={inicial} />
                  <FilaCargo c={delivery} />
                </tbody>
              </table>
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  return (
    <>
      <PageHeader
        title="Alquileres"
        subtitle="Panel de gestión de contratos de alquiler de equipos"
      />
      <div className="app-content">
       <div className="responsive-grid" style={{ gridTemplateColumns: '1fr 320px', flexDirection: 'column' }}>
        <div>
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

        {loading ? <Spinner /> : lista.length === 0 ? (
          <div className="card" style={{ padding: 0 }}>
            <EmptyState icon="ti-calendar-time" message="Sin alquileres en este filtro" />
          </div>
        ) : (
          <>
            {/* VISTA TABLE (Desktop) */}
            <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Nro</th><th>Cliente</th><th>Plan</th>
                    <th>Próximo cobro</th><th>Saldo</th>
                    <th>Contrato</th><th>Financiero</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(a => {
                    const alerta = NIVEL_ALERTA[a.nivelAlerta] || NIVEL_ALERTA.normal
                    return (
                      <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => abrirDetalle(a.id)}>
                        <td className="td-code" style={{ color: 'var(--blue)' }}>{a.numero}</td>
                        <td style={{ fontWeight: 500 }}>{a.cliente?.nombre}</td>
                        <td>{a.plan?.nombre || <span style={{ color: 'var(--text-muted)' }}>Legacy</span>}</td>
                        <td style={{ fontSize: 11, color: alerta.color, fontWeight: alerta.label ? 700 : 400 }} title={alerta.label || ''}>
                          {fecha(a.fechaVencimiento)}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: a.saldoPendiente > 0 ? 'var(--red)' : 'inherit', fontWeight: a.saldoPendiente > 0 ? 700 : 400 }}>
                          {gs(a.saldoPendiente)}
                        </td>
                        <td><span className={`badge badge-${a.estado}`}>{a.estado.replace(/_/g, ' ')}</span></td>
                        <td><span className={`badge badge-${a.estadoFinanciero}`}>{a.estadoFinanciero.replace(/_/g, ' ')}</span></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm" title="Ver detalle" onClick={(e) => { e.stopPropagation(); abrirDetalle(a.id) }}>
                            <i className="ti ti-eye" /> <span className="btn-label-narrow">Detalle</span>
                          </button>
                          {a.estado === 'ACTIVO' && (
                            <button className="btn btn-sm" style={{ marginLeft: 6 }} title="Registrar devolución" onClick={(e) => { e.stopPropagation(); registrarDevolucion(a) }}>
                              <i className="ti ti-arrow-back" /> <span className="btn-label-narrow">Devolución</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* VISTA CARDS (Mobile) */}
            <div className="mobile-list">
              {lista.map(a => {
                const alerta = NIVEL_ALERTA[a.nivelAlerta] || NIVEL_ALERTA.normal
                return (
                  <div key={a.id} className="list-card" style={{ cursor: 'pointer' }} onClick={() => abrirDetalle(a.id)}>
                    <div className="list-card-header">
                      <div className="list-card-title">{a.numero}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span className={`badge badge-${a.estado}`}>{a.estado.replace(/_/g, ' ')}</span>
                        <span className={`badge badge-${a.estadoFinanciero}`}>{a.estadoFinanciero.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                    <div className="list-card-body">
                      <div className="list-card-item">
                        <span className="list-card-label">Cliente</span>
                        <span className="list-card-value">{a.cliente?.nombre || '—'}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Plan</span>
                        <span className="list-card-value">{a.plan?.nombre || 'Legacy'}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Próximo cobro</span>
                        <span className="list-card-value" style={{ color: alerta.color, fontWeight: alerta.label ? 700 : 500 }}>
                          {fecha(a.fechaVencimiento)}
                        </span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Saldo</span>
                        <span className="list-card-value" style={{ color: a.saldoPendiente > 0 ? 'var(--red)' : 'inherit', fontWeight: a.saldoPendiente > 0 ? 700 : 500 }}>
                          {gs(a.saldoPendiente)}
                        </span>
                      </div>
                    </div>
                    <div className="list-card-actions">
                      <button className="btn btn-sm" style={{ flex: 1 }} onClick={(e) => { e.stopPropagation(); abrirDetalle(a.id) }}>
                        <i className="ti ti-eye" /> Ver detalle
                      </button>
                      {a.estado === 'ACTIVO' && (
                        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); registrarDevolucion(a) }}>
                          <i className="ti ti-arrow-back" /> Devolución
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
        </div>

        {/* ── Panel derecho: Mensualidades a cobrar ── */}
        <div className="card" style={{ height: 'fit-content', position: 'sticky', top: 16 }}>
          <div className="card-title" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><i className="ti ti-cash" aria-hidden /> Mensualidades a cobrar ({cobranza.length})</span>
          </div>
          {cobranza.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
              Nada por cobrar ahora mismo.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cobranza.map(c => {
                const alerta = NIVEL_ALERTA[c.nivelAlerta] || NIVEL_ALERTA.normal
                const textoDias = c.dias > 0
                  ? `Vence en ${c.dias} día${c.dias === 1 ? '' : 's'}`
                  : c.dias === 0
                    ? 'Vence hoy'
                    : `Vencido hace ${c.diasAtraso} día${c.diasAtraso === 1 ? '' : 's'}`
                const cargo = c.cargosPendientes[0]
                return (
                  <div
                    key={c.id}
                    className="list-card"
                    style={{ padding: '10px 12px', cursor: 'pointer', background: 'var(--surface-2)', border: '1px solid var(--border)', borderLeft: `3px solid ${alerta.color}`, borderRadius: 8 }}
                    onClick={() => abrirDetalle(c.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>{c.numero}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: alerta.color, textAlign: 'right' }}>{textoDias}</span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6 }}>{c.cliente || '—'}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
                        {gs(c.saldoPendiente)}
                        {c.cargosPendientes.length > 1 && (
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontFamily: 'inherit' }}> · {c.cargosPendientes.length} cuotas</span>
                        )}
                      </span>
                      {cargo && (
                        <button
                          className="btn btn-sm btn-primary"
                          style={{ flexShrink: 0 }}
                          onClick={(e) => { e.stopPropagation(); abrirPago(c.id, cargo) }}
                        >
                          <i className="ti ti-cash" /> Cobrar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

       </div>
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
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>PRÓXIMO VENCIMIENTO</div><div>{fecha(detalle.fechaVencimiento)}</div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>ESTADO CONTRATO</div><span className={`badge badge-${detalle.estado}`}>{detalle.estado.replace(/_/g, ' ')}</span></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>ESTADO FINANCIERO</div><span className={`badge badge-${detalle.estadoFinanciero}`}>{detalle.estadoFinanciero.replace(/_/g, ' ')}</span></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>SALDO PENDIENTE</div><div style={{ fontWeight: 700, color: detalle.saldoPendiente > 0 ? 'var(--red)' : 'var(--green)' }}>{gs(detalle.saldoPendiente)}</div></div>
            </div>

            {detalle.estado === 'ACTIVO' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={abrirModalRecarga}>
                  <i className="ti ti-truck-delivery" /> Solicitar recarga
                </button>
                <button className="btn" onClick={() => registrarDevolucion(detalle)}>
                  <i className="ti ti-arrow-back" /> Registrar devolución / finalizar
                </button>
              </div>
            )}

            <div>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Historial financiero</div>
              {detalle.cargos.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin cargos generados todavía.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th></th><th>Fecha</th><th>Concepto</th><th>Período</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
                    <tbody>
                      {agruparCargos(detalle.cargos).map(item => item.tipo === 'combinado'
                        ? <FilaCargoCombinado key={item.inicial.id} inicial={item.inicial} delivery={item.delivery} />
                        : <FilaCargo key={item.cargo.id} c={item.cargo} />
                      )}
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

            <FormGroup label="Chofer asignado" required>
              <select value={formRecarga.repartidorId} onChange={e => setFormRecarga(f => ({ ...f, repartidorId: e.target.value }))} required>
                <option value="">Seleccioná...</option>
                {repartidores.map(r => <option key={r.id} value={r.id}>{r.nombre || r.username}</option>)}
              </select>
            </FormGroup>

            <FormGroup label="Camión (opcional)" hint="Si no se elige, se usa el que el chofer tenga seleccionado">
              <select value={formRecarga.camionId} onChange={e => setFormRecarga(f => ({ ...f, camionId: e.target.value }))}>
                <option value="">Automático</option>
                {camiones.map(c => <option key={c.id} value={c.id}>{c.placa}</option>)}
              </select>
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

      {/* Modal de registrar pago — va último para que quede por encima del
          pop-up de cobranza cuando se cobra desde ahí. */}
      <Modal
        open={!!modalPago}
        title={`Registrar pago — ${modalPago?.cargos?.map(conceptoLabel).join(' + ') || ''}`}
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
              Monto total: <strong>{gs(modalPago.cargos.reduce((s, c) => s + Number(c.monto), 0))}</strong>
              {' — '}ya pagado: <strong>{gs(modalPago.cargos.reduce((s, c) => s + Number(c.montoPagado), 0))}</strong>
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

      {/* Modal "Pago registrado" — la vista previa es el mismo ticket que se
          imprime (ver ReciboAlquilerTicket.jsx), solo cambia el contenedor:
          .ticket-preview en pantalla, .print-ticket-container al imprimir. */}
      <Modal
        open={!!reciboPago}
        title="Pago registrado"
        onClose={() => setReciboPago(null)}
        width={420}
        footer={
          <>
            <button className="btn" onClick={() => setReciboPago(null)}>Cerrar</button>
            <button className="btn btn-primary" onClick={handleImprimirRecibo}>
              <i className="ti ti-printer" /> Imprimir recibo
            </button>
          </>
        }
      >
        {reciboPago && (
          <div className="ticket-preview">
            <ReciboAlquilerTicket recibo={reciboPago} branding={branding} nombreEmpresa={nombre_empresa} direccion={direccion} telefono={telefono} />
          </div>
        )}
      </Modal>

      {/* Recibo imprimible (solo visible al imprimir; se dispara desde el modal de arriba) */}
      {reciboPago && createPortal(
        <div className="print-ticket-container">
          <ReciboAlquilerTicket recibo={reciboPago} branding={branding} nombreEmpresa={nombre_empresa} direccion={direccion} telefono={telefono} />
        </div>,
        document.body
      )}
    </>
  )
}
