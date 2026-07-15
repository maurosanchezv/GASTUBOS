// gastubos/frontend/src/utils/estadosTubo.js
// Espejo del backend — para mostrar las transiciones válidas en el cliente
// sin hacer un fetch extra

export const TRANSICIONES = {
  DISPONIBLE:  ['CARGADO', 'RESERVADO', 'EN_REVISION', 'VENDIDO', 'DE_BAJA'],
  CARGADO:     ['DISPONIBLE', 'ENTREGADO', 'ALQUILADO', 'RESERVADO', 'EN_REVISION', 'DE_BAJA'],
  VACIO:       ['EN_REVISION', 'CARGADO', 'DE_BAJA'],
  ENTREGADO:   ['DEVUELTO', 'EN_REVISION', 'PERDIDO', 'DE_BAJA'],
  ALQUILADO:   ['DEVUELTO', 'EN_REVISION', 'PERDIDO', 'DE_BAJA'],
  VENDIDO:     [],
  RESERVADO:   ['DISPONIBLE', 'CARGADO', 'ENTREGADO', 'ALQUILADO'],
  PERDIDO:     ['EN_REVISION', 'DE_BAJA'],
  DEVUELTO:    ['DISPONIBLE', 'VACIO', 'EN_REVISION', 'CARGADO', 'DE_BAJA'],
  EN_REVISION: ['DISPONIBLE', 'VACIO', 'CARGADO', 'DE_BAJA'],
  DE_BAJA:     ['DISPONIBLE', 'VACIO', 'CARGADO', 'EN_REVISION', 'DEVUELTO', 'PERDIDO', 'ENTREGADO', 'ALQUILADO'],
}
