// gastubos/frontend/src/utils/ticketsImpresion.js
// Armado del contenido ESC/POS de los tickets de remisión (entrega) y venta
// en camión. Extraído de RepartoPage.jsx para poder reusarse tanto desde el
// envío por Bluetooth clásico (window.bluetoothSerial, dentro de la app) como
// desde el envío por Web Bluetooth (navegador, ver webBluetoothPrinter.js).
import { EscPosBuilder, generarLogoEscPos } from './escPosBuilder.js'
import { formatCapacidad } from '../components/ui.jsx'

export const formatNumberSpanish = (val) => {
  const num = Number(val)
  if (isNaN(num)) return '0'
  const rounded = Math.round(num * 1000) / 1000
  if (Number.isInteger(rounded)) {
    return rounded.toString()
  }
  return rounded.toString().replace('.', ',')
}

export function getObservacionesLimpias(entrega) {
  if (!entrega?.observaciones) return null
  const tuboIdsActuales = new Set((entrega.detalles || []).map(d => d.tuboId))
  let partes = entrega.observaciones.split('|').map(s => s.trim()).filter(Boolean)

  partes = partes.filter(p => {
    if (p.includes('Agregado por repartidor')) {
      const match = p.match(/:\s*([^\]]+)\]/)
      if (match && match[1]) {
        const tuboIdNota = match[1].trim()
        return tuboIdsActuales.has(tuboIdNota)
      }
      return (entrega.detalles || []).some(d => d.esAdicional)
    }
    return true
  })

  const res = partes.join(' | ').trim()
  return res || null
}

function crearHelpersTicket(width) {
  const wrapText = (text, maxChars) => {
    if (!text) return []
    const words = text.split(' ')
    const lines = []
    let currentLine = ''
    words.forEach(word => {
      if ((currentLine + word).length <= maxChars) {
        currentLine += (currentLine ? ' ' : '') + word
      } else {
        if (currentLine) lines.push(currentLine)
        let remaining = word
        while (remaining.length > maxChars) {
          lines.push(remaining.slice(0, maxChars))
          remaining = remaining.slice(maxChars)
        }
        currentLine = remaining
      }
    })
    if (currentLine) lines.push(currentLine)
    return lines
  }
  const justify = (left, right) => {
    const pad = Math.max(1, width - left.length - right.length)
    return left + ' '.repeat(pad) + right
  }
  const line = () => '-'.repeat(width)
  const doubleLine = () => '='.repeat(width)
  return { wrapText, justify, line, doubleLine }
}

// config: { branding: {isotipoSrc, logoSrc}, nombreEmpresa, direccion, telefono,
//           paperWidth, duplicarTicket, recambios: string[] }
export async function construirBufferTicketEntrega(entrega, config) {
  const { branding, nombreEmpresa, direccion, telefono, paperWidth, duplicarTicket, recambios = [] } = config

  let logoBytes = null
  try {
    logoBytes = await generarLogoEscPos(branding.isotipoSrc, branding.logoSrc)
  } catch (e) {
    console.warn('No se pudo generar el logo para la impresion:', e)
  }

  const builder = new EscPosBuilder()
  const width = paperWidth
  const { wrapText, justify, line, doubleLine } = crearHelpersTicket(width)

  const construirTicket = (tituloCopia) => {
    builder.initialize()

    if (logoBytes) {
      builder.addBytes(logoBytes)
      builder.addTextLine('')
    } else {
      builder.alignCenter().boldOn().doubleSizeOn().addTextLine((nombreEmpresa || 'GASTUBOS').toUpperCase()).doubleSizeOff()
    }

    builder.alignCenter()
    if (direccion) {
      wrapText(direccion, width).forEach(l => builder.addTextLine(l))
    }
    if (telefono) {
      wrapText('Tel: ' + telefono, width).forEach(l => builder.addTextLine(l))
    }
    builder.addTextLine(doubleLine())

    if (tituloCopia) {
      builder.alignCenter().boldOn().addTextLine(tituloCopia).boldOff()
      builder.addTextLine(line())
    }

    builder.alignLeft().boldOn().addTextLine('REMISION: ' + entrega.numero).boldOff()
    builder.addTextLine(line())

    const clienteText = 'Cliente: ' + (entrega.cliente?.nombre || '')
    wrapText(clienteText, width).forEach(l => builder.addTextLine(l))

    builder.addTextLine('RUC/CI: ' + (entrega.cliente?.ruc || '-'))

    const dirText = 'Direccion: ' + (entrega.direccionEntrega || '')
    wrapText(dirText, width).forEach(l => builder.addTextLine(l))

    builder.addTextLine('Fecha: ' + new Date(entrega.fechaEntrega).toLocaleString('es-PY'))

    const choferLabel = entrega.canal === 'SALON' ? 'Atendido por: ' : 'Chofer: '
    const choferText = choferLabel + (entrega.repartidor?.nombre || 'Sin asignar')
    wrapText(choferText, width).forEach(l => builder.addTextLine(l))

    builder.addTextLine('Tipo: ' + (entrega.tipoOperacion || '').replace('_', ' '))
    builder.addTextLine(doubleLine())

    builder.boldOn().addTextLine(justify('PRODUCTO', 'SUBTOTAL')).boldOff()
    builder.addTextLine(line())

    let subtotalItems = 0
    entrega.detalles?.forEach(d => {
      const capStr = d.tubo ? ` ${formatCapacidad(d.tubo)}` : ''
      let desc = `${d.tuboId} (${d.tubo?.gas || ''}${capStr})`
      if (d.tubo?.serie && d.tubo?.serie !== d.tuboId) {
        desc += ` Nro:${d.tubo.serie}`
      }
      const cant = `${formatNumberSpanish(d.cantidadGas)} ${d.unidadGas}`
      const precioUnit = Number(d.precioUnitario).toLocaleString('es-PY')
      const price = Number(d.subtotal).toLocaleString('es-PY') + ' GS'

      builder.addTextLine(desc.slice(0, width))
      if (Number(d.cantidadGas) > 0) {
        builder.addTextLine(justify(`  ${cant} x ${precioUnit}`, price))
      } else {
        builder.addTextLine(justify(`  1 Envase Vacío`, price))
      }
      subtotalItems += Number(d.subtotal)
    })
    builder.addTextLine(line())

    const deliveryCost = Number(entrega.costoDelivery || 0)
    builder.addTextLine(justify('DELIVERY:', deliveryCost.toLocaleString('es-PY') + ' GS'))
    builder.boldOn().addTextLine(justify('TOTAL:', (subtotalItems + deliveryCost).toLocaleString('es-PY') + ' GS')).boldOff()
    builder.addTextLine(doubleLine())

    if (recambios.length > 0) {
      builder.boldOn().addTextLine('RECAMBIOS RECIBIDOS:').boldOff()
      recambios.forEach(desc => {
        const wrapped = wrapText(desc, width - 2)
        wrapped.forEach((lineText, idx) => {
          if (idx === 0) {
            builder.addTextLine('- ' + lineText)
          } else {
            builder.addTextLine('  ' + lineText)
          }
        })
      })
      builder.addTextLine(line())
    }

    const obsBT = getObservacionesLimpias(entrega)
    if (obsBT) {
      const obsText = 'Obs: ' + obsBT
      wrapText(obsText, width).forEach(l => builder.addTextLine(l))
      builder.addTextLine(line())
    }

    builder.addTextLine('').addTextLine('')
    const lineLength = width >= 48 ? 18 : 13
    const leftLine = '-'.repeat(lineLength)
    const rightLine = '-'.repeat(lineLength)
    const spacesBetweenLines = width - (lineLength * 2)
    builder.addTextLine(leftLine + ' '.repeat(spacesBetweenLines) + rightLine)

    const labelLeft = entrega.canal === 'SALON' ? 'Firma Operador' : 'Firma Chofer'
    const labelRight = 'Firma Cliente'
    const padLeft = Math.max(0, Math.floor((lineLength - labelLeft.length) / 2))
    const padRight = Math.max(0, Math.floor((lineLength - labelRight.length) / 2))

    const strLeft = ' '.repeat(padLeft) + labelLeft + ' '.repeat(Math.max(0, lineLength - labelLeft.length - padLeft))
    const strRight = ' '.repeat(padRight) + labelRight + ' '.repeat(Math.max(0, lineLength - labelRight.length - padRight))

    builder.addTextLine(strLeft + ' '.repeat(spacesBetweenLines) + strRight)
    builder.addTextLine('')

    builder.alignCenter().boldOn().addTextLine('Gracias por su preferencia!').boldOff()
  }

  if (duplicarTicket) {
    construirTicket('*** COPIA CHOFER ***')
    builder.addTextLine('').addTextLine('').addTextLine('')
    builder.alignCenter().addTextLine('- - - - - - - - - - - - - - - -')
    builder.addTextLine('').addTextLine('').addTextLine('')
    construirTicket('*** COPIA CLIENTE ***')
  } else {
    construirTicket(null)
  }

  builder.addTextLine('').addTextLine('').addTextLine('').addTextLine('').addTextLine('').addTextLine('')
  builder.feedLines(4)
  return builder.getBuffer()
}

// config: { branding: {isotipoSrc, logoSrc}, nombreEmpresa, direccion, telefono, paperWidth }
export async function construirBufferTicketVentaCamion(carga, config) {
  const { branding, nombreEmpresa, direccion, telefono, paperWidth } = config

  let logoBytes = null
  try {
    logoBytes = await generarLogoEscPos(branding.isotipoSrc, branding.logoSrc)
  } catch (e) {
    console.warn('No se pudo generar el logo para la impresion:', e)
  }

  const builder = new EscPosBuilder()
  const width = paperWidth
  const { wrapText, justify, line, doubleLine } = crearHelpersTicket(width)

  builder.initialize()
  if (logoBytes) {
    builder.addBytes(logoBytes)
    builder.addTextLine('')
  } else {
    builder.alignCenter().boldOn().doubleSizeOn().addTextLine((nombreEmpresa || 'GASTUBOS').toUpperCase()).doubleSizeOff()
  }

  builder.alignCenter()
  if (direccion) {
    wrapText(direccion, width).forEach(l => builder.addTextLine(l))
  }
  if (telefono) {
    wrapText('Tel: ' + telefono, width).forEach(l => builder.addTextLine(l))
  }
  builder.addTextLine(doubleLine())

  builder.alignLeft().boldOn().addTextLine('VENTA CAMION: ' + carga.numero).boldOff()
  builder.addTextLine(line())

  const clienteText = 'Cliente: ' + (carga.cliente?.nombre || '')
  wrapText(clienteText, width).forEach(l => builder.addTextLine(l))
  builder.addTextLine('RUC/CI: ' + (carga.cliente?.ruc || '-'))
  builder.addTextLine('Fecha: ' + new Date(carga.fechaCarga).toLocaleString('es-PY'))
  builder.addTextLine('Chofer: ' + (carga.operador?.nombre || carga.operador?.username || ''))
  builder.addTextLine(doubleLine())

  builder.boldOn().addTextLine(justify('PRODUCTO', 'SUBTOTAL')).boldOff()
  builder.addTextLine(line())

  const cantStr = `${formatNumberSpanish(carga.cantidad)} ${carga.unidad}`
  const precioUnitStr = Number(carga.precioUnitario).toLocaleString('es-PY')
  const subtotal = Number(carga.cantidad) * Number(carga.precioUnitario)
  const subtotalStr = subtotal.toLocaleString('es-PY') + ' GS'

  builder.addTextLine(`${carga.tubo?.gas || ''} (Tubo ${carga.tuboId})`.slice(0, width))
  builder.addTextLine(justify(`  ${cantStr} x ${precioUnitStr}`, subtotalStr))
  builder.addTextLine(line())
  builder.boldOn().addTextLine(justify('TOTAL:', subtotalStr)).boldOff()
  builder.addTextLine(doubleLine())

  builder.addTextLine('Forma de pago: ' + (carga.metodoPago || '-'))
  builder.addTextLine('Recibido: ' + Number(carga.montoRecibido || 0).toLocaleString('es-PY') + ' GS')
  builder.addTextLine(doubleLine())

  builder.addTextLine('').addTextLine('')
  const lineLength = width >= 48 ? 18 : 13
  const soloLine = '-'.repeat(lineLength)
  const padCentro = Math.max(0, Math.floor((width - lineLength) / 2))
  builder.addTextLine(' '.repeat(padCentro) + soloLine)
  const labelFirma = 'Firma Cliente'
  const padLabel = Math.max(0, Math.floor((width - labelFirma.length) / 2))
  builder.addTextLine(' '.repeat(padLabel) + labelFirma)
  builder.addTextLine('')

  builder.alignCenter().boldOn().addTextLine('Gracias por su preferencia!').boldOff()

  builder.addTextLine('').addTextLine('').addTextLine('').addTextLine('').addTextLine('').addTextLine('')
  builder.feedLines(4)
  return builder.getBuffer()
}

export async function construirBufferTicketCargaSalon(carga, config) {
  const { branding, nombreEmpresa, direccion, telefono, paperWidth } = config

  let logoBytes = null
  try {
    logoBytes = await generarLogoEscPos(branding.isotipoSrc, branding.logoSrc)
  } catch (e) {
    console.warn('No se pudo generar el logo para la impresion:', e)
  }

  const builder = new EscPosBuilder()
  const width = paperWidth
  const { wrapText, justify, line, doubleLine } = crearHelpersTicket(width)

  builder.initialize()
  if (logoBytes) {
    builder.addBytes(logoBytes)
    builder.addTextLine('')
  } else {
    builder.alignCenter().boldOn().doubleSizeOn().addTextLine((nombreEmpresa || 'GASTUBOS').toUpperCase()).doubleSizeOff()
  }

  builder.alignCenter()
  if (direccion) {
    wrapText(direccion, width).forEach(l => builder.addTextLine(l))
  }
  if (telefono) {
    wrapText('Tel: ' + telefono, width).forEach(l => builder.addTextLine(l))
  }
  builder.addTextLine(doubleLine())

  builder.alignLeft().boldOn().addTextLine('CARGA EN SALON: ' + carga.numero).boldOff()
  builder.addTextLine(line())

  const clienteText = 'Cliente: ' + (carga.cliente?.nombre || 'Sin cliente')
  wrapText(clienteText, width).forEach(l => builder.addTextLine(l))
  if (carga.cliente?.ruc) {
    builder.addTextLine('RUC/CI: ' + carga.cliente.ruc)
  }
  builder.addTextLine('Fecha: ' + new Date(carga.fechaCarga).toLocaleString('es-PY'))
  builder.addTextLine('Atendido por: ' + (carga.operador?.nombre || carga.operador?.username || ''))
  builder.addTextLine(doubleLine())

  builder.boldOn().addTextLine(justify('PRODUCTO', 'SUBTOTAL')).boldOff()
  builder.addTextLine(line())

  const cantStr = `${formatNumberSpanish(carga.cantidad)} ${carga.unidad}`
  const precioUnitStr = Number(carga.precioUnitario).toLocaleString('es-PY')
  const subtotal = Math.round(Number(carga.cantidad) * Number(carga.precioUnitario))
  const subtotalStr = subtotal.toLocaleString('es-PY') + ' GS'

  builder.addTextLine((carga.tipoGas || '').slice(0, width))
  builder.addTextLine(justify(`  ${cantStr} x ${precioUnitStr}`, subtotalStr))
  builder.addTextLine(line())
  builder.boldOn().addTextLine(justify('TOTAL:', subtotalStr)).boldOff()
  builder.addTextLine(doubleLine())

  builder.addTextLine('Forma de pago: ' + (carga.metodoPago || '-'))
  builder.addTextLine(doubleLine())

  builder.addTextLine('').addTextLine('')
  const lineLength = width >= 48 ? 18 : 13
  const soloLine = '-'.repeat(lineLength)
  const padCentro = Math.max(0, Math.floor((width - lineLength) / 2))
  builder.addTextLine(' '.repeat(padCentro) + soloLine)
  const labelFirma = 'Firma Cliente'
  const padLabel = Math.max(0, Math.floor((width - labelFirma.length) / 2))
  builder.addTextLine(' '.repeat(padLabel) + labelFirma)
  builder.addTextLine('')

  builder.alignCenter().boldOn().addTextLine('Gracias por su preferencia!').boldOff()

  builder.addTextLine('').addTextLine('').addTextLine('').addTextLine('').addTextLine('').addTextLine('')
  builder.feedLines(4)
  return builder.getBuffer()
}

// config: { branding: {isotipoSrc, logoSrc}, nombreEmpresa, direccion, telefono, paperWidth }
export async function construirBufferTicketVentaProductos(venta, config) {
  const { branding, nombreEmpresa, direccion, telefono, paperWidth } = config

  let logoBytes = null
  try {
    logoBytes = await generarLogoEscPos(branding.isotipoSrc, branding.logoSrc)
  } catch (e) {
    console.warn('No se pudo generar el logo para la impresion:', e)
  }

  const builder = new EscPosBuilder()
  const width = paperWidth
  const { wrapText, justify, line, doubleLine } = crearHelpersTicket(width)

  builder.initialize()
  if (logoBytes) {
    builder.addBytes(logoBytes)
    builder.addTextLine('')
  } else {
    builder.alignCenter().boldOn().doubleSizeOn().addTextLine((nombreEmpresa || 'GASTUBOS').toUpperCase()).doubleSizeOff()
  }

  builder.alignCenter()
  if (direccion) {
    wrapText(direccion, width).forEach(l => builder.addTextLine(l))
  }
  if (telefono) {
    wrapText('Tel: ' + telefono, width).forEach(l => builder.addTextLine(l))
  }
  builder.addTextLine(doubleLine())

  builder.alignLeft().boldOn().addTextLine('VENTA: ' + venta.numero).boldOff()
  builder.addTextLine(line())

  const clienteText = 'Cliente: ' + (venta.cliente?.nombre || 'Sin cliente')
  wrapText(clienteText, width).forEach(l => builder.addTextLine(l))
  if (venta.cliente) {
    builder.addTextLine('RUC/CI: ' + (venta.cliente?.ruc || '-'))
  }
  builder.addTextLine('Fecha: ' + new Date(venta.fechaVenta).toLocaleString('es-PY'))
  builder.addTextLine('Vendedor: ' + (venta.usuario?.nombre || venta.usuario?.username || '-'))
  builder.addTextLine(doubleLine())

  builder.boldOn().addTextLine(justify('PRODUCTO', 'SUBTOTAL')).boldOff()
  builder.addTextLine(line())

  venta.detalles?.forEach(d => {
    const cant = formatNumberSpanish(d.cantidad)
    const precioUnit = Number(d.precioUnitario).toLocaleString('es-PY')
    const price = Number(d.subtotal).toLocaleString('es-PY') + ' GS'

    builder.addTextLine(d.descripcion.slice(0, width))
    builder.addTextLine(justify(`  ${cant} x ${precioUnit}`, price))
  })
  builder.addTextLine(line())

  builder.boldOn().addTextLine(justify('TOTAL:', Number(venta.total).toLocaleString('es-PY') + ' GS')).boldOff()
  builder.addTextLine(doubleLine())

  builder.addTextLine('Forma de pago: ' + (venta.metodoPago === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo'))

  if (venta.observaciones) {
    builder.addTextLine(line())
    wrapText('Obs: ' + venta.observaciones, width).forEach(l => builder.addTextLine(l))
  }
  builder.addTextLine(doubleLine())

  builder.addTextLine('')
  builder.alignCenter().boldOn().addTextLine('Gracias por su preferencia!').boldOff()

  builder.addTextLine('').addTextLine('').addTextLine('').addTextLine('').addTextLine('').addTextLine('')
  builder.feedLines(4)
  return builder.getBuffer()
}

// "Remisión Inicial": documento de despacho que se imprime ANTES de que el
// repartidor entregue (montos estimados, sin recambios todavía). Distinto del
// comprobante final (construirBufferTicketEntrega), que se imprime una vez
// confirmada la entrega. Usado desde EntregasPage.jsx (panel de oficina).
// config: { branding: {isotipoSrc, logoSrc}, nombreEmpresa, direccion, telefono, paperWidth }
export async function construirBufferTicketRemisionInicial(entrega, config) {
  const { branding, nombreEmpresa, direccion, telefono, paperWidth } = config

  let logoBytes = null
  try {
    logoBytes = await generarLogoEscPos(branding.isotipoSrc, branding.logoSrc)
  } catch (e) {
    console.warn('No se pudo generar el logo para la impresion:', e)
  }

  const builder = new EscPosBuilder()
  const width = paperWidth
  const { wrapText, justify, line, doubleLine } = crearHelpersTicket(width)

  builder.initialize()
  if (logoBytes) {
    builder.addBytes(logoBytes)
    builder.addTextLine('')
  } else {
    builder.alignCenter().boldOn().doubleSizeOn().addTextLine((nombreEmpresa || 'GASTUBOS').toUpperCase()).doubleSizeOff()
  }

  builder.alignCenter()
  if (direccion) {
    wrapText(direccion, width).forEach(l => builder.addTextLine(l))
  }
  if (telefono) {
    wrapText('Tel: ' + telefono, width).forEach(l => builder.addTextLine(l))
  }
  builder.addTextLine(doubleLine())

  builder.alignLeft().boldOn().addTextLine('REMISION DE SALIDA: ' + entrega.numero).boldOff()
  builder.addTextLine(line())

  const clienteText = 'Cliente: ' + (entrega.cliente?.nombre || '')
  wrapText(clienteText, width).forEach(l => builder.addTextLine(l))
  builder.addTextLine('RUC/CI: ' + (entrega.cliente?.ruc || '-'))
  const dirText = 'Direccion: ' + (entrega.direccionEntrega || '')
  wrapText(dirText, width).forEach(l => builder.addTextLine(l))
  builder.addTextLine('Fecha de orden: ' + new Date(entrega.fechaEntrega).toLocaleString('es-PY'))
  const choferText = 'Chofer asignado: ' + (entrega.repartidor?.nombre || 'Sin asignar')
  wrapText(choferText, width).forEach(l => builder.addTextLine(l))
  builder.addTextLine('Tipo: ' + (entrega.tipoOperacion || '').replace('_', ' '))
  builder.addTextLine('Pago: ' + (entrega.metodoPago === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo'))
  builder.addTextLine(doubleLine())

  builder.boldOn().addTextLine(justify('PRODUCTO', 'SUBTOTAL')).boldOff()
  builder.addTextLine(line())

  let subtotalItems = 0
  entrega.detalles?.forEach(d => {
    const desc = `${d.tuboId} (${d.tubo?.gas || ''})`
    const cant = `${formatNumberSpanish(d.cantidadGas)} ${d.unidadGas}`
    const precioUnit = Number(d.precioUnitario).toLocaleString('es-PY')
    const price = Number(d.subtotal).toLocaleString('es-PY') + ' GS'

    builder.addTextLine(desc.slice(0, width))
    if (Number(d.cantidadGas) > 0) {
      builder.addTextLine(justify(`  ${cant} x ${precioUnit}`, price))
    } else {
      builder.addTextLine(justify(`  1 Envase Vacío`, price))
    }
    subtotalItems += Number(d.subtotal)
  })
  builder.addTextLine(line())

  const deliveryCost = Number(entrega.costoDelivery || 0)
  builder.addTextLine(justify('DELIVERY:', deliveryCost.toLocaleString('es-PY') + ' GS'))
  builder.boldOn().addTextLine(justify('TOTAL ESTIMADO:', (subtotalItems + deliveryCost).toLocaleString('es-PY') + ' GS')).boldOff()
  builder.addTextLine(doubleLine())

  builder.addTextLine('').addTextLine('')
  const lineLength2 = width >= 48 ? 18 : 13
  const leftLine = '-'.repeat(lineLength2)
  const rightLine = '-'.repeat(lineLength2)
  const spacesBetweenLines = width - (lineLength2 * 2)
  builder.addTextLine(leftLine + ' '.repeat(spacesBetweenLines) + rightLine)

  const labelLeft = 'Deposito'
  const labelRight = 'Chofer'
  const padLeft = Math.max(0, Math.floor((lineLength2 - labelLeft.length) / 2))
  const padRight = Math.max(0, Math.floor((lineLength2 - labelRight.length) / 2))
  const strLeft = ' '.repeat(padLeft) + labelLeft + ' '.repeat(Math.max(0, lineLength2 - labelLeft.length - padLeft))
  const strRight = ' '.repeat(padRight) + labelRight + ' '.repeat(Math.max(0, lineLength2 - labelRight.length - padRight))
  builder.addTextLine(strLeft + ' '.repeat(spacesBetweenLines) + strRight)
  builder.addTextLine('')

  builder.addTextLine('').addTextLine('').addTextLine('').addTextLine('').addTextLine('').addTextLine('')
  builder.feedLines(4)
  return builder.getBuffer()
}
