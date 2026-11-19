// gastubos/frontend/src/utils/ticketPruebaLargo.js
//
// Entrega ficticia (no se guarda en la base) con muchos tubos, recambios y
// observaciones largas, para probar la vista previa y la descarga PDF/JPG de
// tickets largos. Solo se ofrece en el entorno de desarrollo.

const GASES = [
  { gas: 'Oxígeno', unidad: 'M3', capacidadLitros: 10, precio: 25000 },
  { gas: 'Argón', unidad: 'M3', capacidadLitros: 8, precio: 45000 },
  { gas: 'CO2', unidad: 'KG', capacidadKg: 25, precio: 12000 },
  { gas: 'Acetileno', unidad: 'KG', capacidadKg: 6.5, precio: 60000 },
  { gas: 'Nitrógeno', unidad: 'M3', capacidadLitros: 15, precio: 20000 },
  { gas: 'Mezcla', unidad: 'M3', capacidadLitros: 10, precio: 40000 },
]

export function crearEntregaPruebaLarga() {
  const detalles = Array.from({ length: 24 }, (_, i) => {
    const g = GASES[i % GASES.length]
    const cantidad = g.capacidadKg ?? g.capacidadLitros
    const tuboId = `PRB-${String(i + 1).padStart(3, '0')}`
    return {
      id: `prueba-det-${i}`,
      tuboId,
      esAdicional: i % 9 === 8,
      cantidadGas: i % 7 === 6 ? 0 : cantidad,
      unidadGas: g.unidad,
      precioUnitario: g.precio,
      subtotal: i % 7 === 6 ? 0 : cantidad * g.precio,
      tubo: { id: tuboId, serie: `S-${10000 + i * 37}`, gas: g.gas, capacidadKg: g.capacidadKg, capacidadLitros: g.capacidadLitros },
    }
  })

  return {
    id: 'prueba-ticket-largo',
    numero: 'E-PRUEBA-LARGO',
    canal: 'DELIVERY',
    confirmada: true,
    cancelada: false,
    tipoOperacion: 'ENTREGA_SIMPLE',
    metodoPago: 'TRANSFERENCIA',
    fechaEntrega: new Date().toISOString(),
    direccionEntrega: 'Ruta Nacional Mariscal López (Acceso Sur), 29 de Setiembre, Fernando de la Mora — Depósito 3, portón azul',
    costoDelivery: 35000,
    cliente: { nombre: 'Cliente de Prueba Industrial S.A.', ruc: '80012345-6' },
    repartidor: { nombre: 'Repartidor de Prueba' },
    detalles,
    ventaProducto: { total: 185000 },
    recambios: Array.from({ length: 10 }, (_, i) => ({
      tuboEntregadoId: `REC-${String(i + 1).padStart(3, '0')}`,
      tuboEntregado: { id: `REC-${String(i + 1).padStart(3, '0')}`, gas: GASES[i % GASES.length].gas },
    })),
    cilindrosTerceros: [
      { gas: 'Oxígeno', capacidadLitros: 6, observaciones: '' },
      { gas: 'CO2', capacidadKg: 10, observaciones: 'Cilindro de tercero con válvula dañada, se recibe para revisión' },
    ],
    alquileres: [],
    observaciones: 'Ticket de prueba generado en desarrollo para verificar la descarga en PDF/JPG de tickets largos. '
      + 'Entregar en horario de 7:00 a 16:00, llamar antes de llegar. Dejar los tubos vacíos en el sector B.',
  }
}
