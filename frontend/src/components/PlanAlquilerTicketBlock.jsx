// gastubos/frontend/src/components/PlanAlquilerTicketBlock.jsx
//
// Bloque "Detalle del plan de alquiler" para los tickets HTML de ~80mm
// (los que se imprimen con window.print() y también se ven en la vista previa).
// El equivalente para la impresión térmica ESC/POS vive en
// utils/ticketsImpresion.js (imprimirBloquePlanAlquiler). Mantener ambos en
// sincronía si cambia el contenido.
//
// props:
//   entrega        — la entrega, con entrega.alquileres[].items y .plan
//   incluirEstado  — mostrar entrega.observacionEquipoAlquiler (solo comprobante final)

export default function PlanAlquilerTicketBlock({ entrega, incluirEstado = false }) {
  if (!entrega || entrega.tipoOperacion !== 'ALQUILER') return null

  const alquileres = (entrega.alquileres || []).filter(a => a.estado !== 'CANCELADO')
  if (alquileres.length === 0) return null

  const plan = alquileres[0].plan
  const varios = alquileres.length > 1

  const th = { margin: '8px 0 4px', fontSize: '11px', fontWeight: 'bold', borderTop: '1px dashed #000', paddingTop: '4px' }

  return (
    <div style={{ margin: '8px 0', fontSize: '10px' }}>
      <div style={th}>DETALLE DEL PLAN DE ALQUILER</div>
      <div>Operación: Entrega de alquiler</div>
      {plan?.nombre && <div><strong>Plan: {plan.nombre}</strong></div>}

      {alquileres.map((a, idx) => {
        const items = (a.items || []).slice().sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0))
        return (
          <div key={a.id} style={{ marginTop: '4px' }}>
            <div style={{ fontWeight: 600 }}>
              {varios ? `Equipo ${idx + 1} · ` : ''}Contrato {a.numero}
              {a.tuboId ? ` · Cilindro ${a.tuboId}` : ''}
            </div>
            {items.length === 0 ? (
              <div style={{ fontStyle: 'italic' }}>Sin ítems en el plan.</div>
            ) : (
              <ul style={{ paddingLeft: 14, margin: '2px 0' }}>
                {items.map(it => (
                  <li key={it.id} style={{ textDecoration: it.entregado === false ? 'line-through' : 'none' }}>
                    {it.cantidad || 1}x {it.descripcion}
                    {it.serie ? ` — Serie: ${it.serie}` : (it.serializado ? ' — Serie: __________' : '')}
                    {it.entregado === false ? ' (no entregado)' : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}

      {incluirEstado && entrega.observacionEquipoAlquiler && (
        <div style={{ marginTop: '4px' }}>
          <strong>Estado del equipo:</strong> {entrega.observacionEquipoAlquiler}
        </div>
      )}
    </div>
  )
}
