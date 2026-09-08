// gastubos/frontend/src/pages/RecargasAlquilerPage.jsx
// Panel de SEGUIMIENTO de las órdenes de recarga/recambio a domicilio de
// contratos de alquiler. La solicitud y la asignación del chofer se hacen
// siempre desde Alquileres → detalle del contrato → "Solicitar recarga";
// acá solo se monitorea el estado y, si hace falta, se cancela una orden.
import { useEffect, useState } from 'react'
import api from '../services/api.js'
import { PageHeader, Spinner, EmptyState, useToast } from '../components/ui.jsx'

const gs = (val) => Number(val || 0).toLocaleString('es-PY') + ' Gs'
const fecha = (val) => val ? new Date(val).toLocaleString('es-PY') : '—'

const ESTADO_BADGE = {
  SOLICITADA: 'PENDIENTE', ASIGNADA: 'PENDIENTE', EN_RUTA: 'PARCIAL', EN_SERVICIO: 'PARCIAL',
  COMPLETADA: 'ACTIVO', CANCELADA: 'CANCELADO',
}

export default function RecargasAlquilerPage() {
  const { toast } = useToast()
  const [ordenes, setOrdenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todas')

  const load = async () => {
    try {
      const rOrdenes = await api.get('/recargas-alquiler')
      setOrdenes(rOrdenes.data)
    } catch (err) {
      toast('Error al cargar recargas de alquiler', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const lista = ordenes.filter(o => {
    if (filtro === 'todas') return true
    if (filtro === 'pendientes') return ['SOLICITADA', 'ASIGNADA'].includes(o.estado)
    if (filtro === 'en_ruta') return ['EN_RUTA', 'EN_SERVICIO'].includes(o.estado)
    if (filtro === 'completadas') return o.estado === 'COMPLETADA'
    if (filtro === 'canceladas') return o.estado === 'CANCELADA'
    return true
  })

  async function cancelarOrden(orden) {
    const motivo = window.prompt(`Cancelar orden ${orden.numero}. Motivo:`)
    if (motivo === null) return
    try {
      await api.post(`/recargas-alquiler/${orden.id}/cancelar`, { motivo })
      toast('Orden cancelada', 'success')
      load()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al cancelar', 'error')
    }
  }

  const tabs = [
    ['todas', 'Todas'], ['pendientes', 'Pendientes'],
    ['en_ruta', 'En ruta'], ['completadas', 'Completadas'], ['canceladas', 'Canceladas'],
  ]

  return (
    <>
      <PageHeader title="Recargas de Alquiler" subtitle="Seguimiento de servicios de recarga y recambio a domicilio" />
      <div className="app-content">
        <div className="tabs">
          {tabs.map(([v, l]) => (
            <div key={v} className={`tab ${filtro === v ? 'active' : ''}`} onClick={() => setFiltro(v)}>{l}</div>
          ))}
        </div>

        {loading ? <Spinner /> : (
          <div className="card" style={{ padding: 0 }}>
            {lista.length === 0 ? <EmptyState icon="ti-truck-delivery" message="Sin recargas en este filtro" /> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nro</th><th>Cliente</th><th>Contrato</th><th>Plan</th><th>Tipo</th><th>Tubo</th>
                      <th>Fecha</th><th>Repartidor</th><th>Camión</th><th>Monto</th><th>Estado</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map(o => (
                      <tr key={o.id}>
                        <td className="td-code">{o.numero}</td>
                        <td style={{ fontWeight: 500 }}>{o.cliente?.nombre}</td>
                        <td className="td-code">{o.alquiler?.numero}</td>
                        <td>{o.alquiler?.plan?.nombre || '—'}</td>
                        <td style={{ fontSize: 11 }}>{o.tipoServicio.replace(/_/g, ' ')}</td>
                        <td className="td-code">{o.tubo?.id}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fecha(o.fechaProgramada || o.fechaSolicitud)}</td>
                        <td style={{ fontSize: 11 }}>{o.repartidor?.nombre || o.repartidor?.username || '—'}</td>
                        <td style={{ fontSize: 11 }}>{o.camion?.placa || '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{gs(o.precioAplicado)}</td>
                        <td><span className={`badge badge-${ESTADO_BADGE[o.estado] || 'PENDIENTE'}`}>{o.estado.replace(/_/g, ' ')}</span></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {['SOLICITADA', 'ASIGNADA'].includes(o.estado) && (
                            <button className="btn btn-sm" onClick={() => cancelarOrden(o)}>Cancelar</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
