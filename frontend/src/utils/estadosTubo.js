// gastubos/frontend/src/utils/estadosTubo.js
// Espejo del backend — para mostrar las transiciones válidas en el cliente
// sin hacer un fetch extra

export const TRANSICIONES = {
  DISPONIBLE:  ['CARGADO', 'RESERVADO', 'EN_REVISION', 'VENDIDO'],
  CARGADO:     ['DISPONIBLE', 'ENTREGADO', 'ALQUILADO', 'RESERVADO', 'EN_REVISION'],
  VACIO:       ['EN_REVISION', 'CARGADO'],
  ENTREGADO:   ['DEVUELTO', 'EN_REVISION', 'PERDIDO'],
  ALQUILADO:   ['DEVUELTO', 'EN_REVISION', 'PERDIDO'],
  VENDIDO:     [],
  RESERVADO:   ['DISPONIBLE', 'CARGADO', 'ENTREGADO', 'ALQUILADO'],
  PERDIDO:     ['EN_REVISION'],
  DEVUELTO:    ['DISPONIBLE', 'VACIO', 'EN_REVISION', 'CARGADO'],
  EN_REVISION: ['DISPONIBLE', 'VACIO', 'CARGADO'],
}
