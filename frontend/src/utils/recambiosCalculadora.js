// gastubos/frontend/src/utils/recambiosCalculadora.js
//
// Helpers para el selector de gas/capacidad usado al registrar un retorno de
// cilindro (recambio). Misma data/lógica que ya usa RepartoPage.jsx para que
// el canal de reparto y el de salón pidan exactamente los mismos datos de la
// misma forma — duplicado a propósito en vez de importado, para no tocar
// RepartoPage.jsx (vista móvil en producción usada por repartidores reales).

export const GASES_RETORNO = [
  'CO2', 'Oxígeno', 'Argón', 'Nitrógeno', 'Aire comprimido', 'Acetileno', 'Mezcla Ar+CO2', 'Mezcla especial',
]

const CAPACIDADES_ACETILENO = ['1 kg', '1.2 kg', '1.5 kg', '2 kg', '2.5 kg', '3 kg', '3.5 kg', '4 kg', '4.5 kg', '5 kg', '5.5 kg', '6 kg', '7 kg', '8 kg']
const CAPACIDADES_CO2 = ['1 kg', '2 kg', '3 kg', '4 kg', '5 kg', '6 kg', '7 kg', '8 kg', '10 kg', '13 kg', '15 kg', '20 kg', '25 kg', '30 kg']
const CAPACIDADES_DEFAULT = ['1 m³', '1.5 m³', '2.5 m³', '3 m³', '4 m³', '5 m³', '6 m³', '6.5 m³', '7 m³', '7.15 m³', '7.5 m³', '8.5 m³']

export function capacidadesParaGas(gas) {
  const gLower = (gas || '').toLowerCase()
  if (gLower === 'acetileno') return CAPACIDADES_ACETILENO
  if (gLower === 'co2') return CAPACIDADES_CO2
  return CAPACIDADES_DEFAULT
}

export function capacidadInicialParaGas(gas) {
  const gLower = (gas || '').toLowerCase()
  if (gLower === 'acetileno') return '6 kg'
  if (gLower === 'co2') return '25 kg'
  return '6 m³'
}

// Arma la descripción "Gas Capacidad" para un retorno agregado por botones,
// evitando duplicados dentro de la misma sesión (agrega "#2", "#3", ...).
export function nextRecambioDescripcion(gas, capacidad, existentes) {
  const baseDesc = `${gas} ${capacidad}`
  let desc = baseDesc
  let suffix = 2
  while (existentes.includes(desc)) {
    desc = `${baseDesc} #${suffix}`
    suffix++
  }
  return desc
}
