// gastubos/backend/src/utils/estadosTubo.js
//
// Define qué transiciones de estado están permitidas.
// Clave: estado actual → Valor: array de estados a los que puede pasar.
//
// Reglas de negocio:
//   - Un tubo VENDIDO no puede volver a ningún estado (es final).
//   - Un tubo PERDIDO solo puede ir a EN_REVISION si aparece.
//   - Un tubo ENTREGADO o ALQUILADO vuelve como DEVUELTO o EN_REVISION.
//   - Un tubo EN_REVISION puede quedar DISPONIBLE o VACIO según el técnico.

export const TRANSICIONES_VALIDAS = {
  DISPONIBLE:  ['CARGADO', 'RESERVADO', 'EN_REVISION', 'VENDIDO', 'DE_BAJA'],
  CARGADO:     ['DISPONIBLE', 'ENTREGADO', 'ALQUILADO', 'RESERVADO', 'EN_REVISION', 'DE_BAJA'],
  VACIO:       ['EN_REVISION', 'CARGADO', 'DE_BAJA'],
  ENTREGADO:   ['DEVUELTO', 'EN_REVISION', 'PERDIDO', 'DE_BAJA'],
  ALQUILADO:   ['DEVUELTO', 'EN_REVISION', 'PERDIDO', 'DE_BAJA'],
  VENDIDO:     [],   // estado final
  RESERVADO:   ['DISPONIBLE', 'CARGADO', 'ENTREGADO', 'ALQUILADO'],
  PERDIDO:     ['EN_REVISION', 'DE_BAJA'],
  DEVUELTO:    ['DISPONIBLE', 'VACIO', 'EN_REVISION', 'CARGADO', 'DE_BAJA'],
  EN_REVISION: ['DISPONIBLE', 'VACIO', 'CARGADO', 'DE_BAJA'],
  DE_BAJA:     ['DISPONIBLE', 'VACIO', 'CARGADO', 'EN_REVISION', 'DEVUELTO', 'PERDIDO', 'ENTREGADO', 'ALQUILADO'],
}

// Verifica si una transición es válida
export function esTransicionValida(estadoActual, estadoNuevo) {
  return (TRANSICIONES_VALIDAS[estadoActual] || []).includes(estadoNuevo)
}

// Lista todos los estados
export const ESTADOS = Object.keys(TRANSICIONES_VALIDAS)
