// gastubos/frontend/src/utils/descargarTicket.js
//
// Descarga de un ticket HTML (~80mm) como PDF o JPG.
//
// Se clona el nodo del ticket fuera de pantalla con un ancho fijo de 80mm,
// así la imagen sale igual sin importar el ancho del modal o del dispositivo.
// El PDF es una sola página de 80mm de ancho y alto variable (como el rollo
// térmico), para que un ticket largo no quede cortado en hojas A4.

import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const ANCHO_MM = 80
const ANCHO_PX = 302 // 80mm a 96dpi

export function esEntornoDesarrollo() {
  if (import.meta.env.DEV) return true
  const host = window.location.hostname
  return host.startsWith('devapp.') || host === 'localhost' || host === '127.0.0.1'
}

// Proporción intrínseca de una imagen. Los SVG del branding no tienen
// width/height (solo viewBox) y el navegador puede reportar naturalWidth 0,
// así que en ese caso se lee el viewBox del data URL.
function proporcionImagen(img, src) {
  if (img.naturalWidth && img.naturalHeight) return img.naturalWidth / img.naturalHeight
  try {
    const svg = src.startsWith('data:image/svg+xml')
      ? decodeURIComponent(src.slice(src.indexOf(',') + 1))
      : ''
    const vb = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
    if (vb) return parseFloat(vb[1]) / parseFloat(vb[2])
  } catch { /* se usa la proporción de la caja */ }
  return null
}

function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// html2canvas no soporta object-fit y dibuja mal los SVG sin tamaño propio
// (salían recortados y descentrados). Cada <img> del clon se reemplaza por un
// PNG ya ajustado con "contain" al tamaño exacto de su caja.
async function rasterizarImagenes(clon, escala) {
  await Promise.all([...clon.querySelectorAll('img')].map(async (el) => {
    const { width: w, height: h } = el.getBoundingClientRect()
    if (!w || !h || !el.src) return
    try {
      const fuente = await cargarImagen(el.src)
      const prop = proporcionImagen(fuente, el.src) || w / h
      let dw = w, dh = w / prop
      if (dh > h) { dh = h; dw = h * prop }
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * escala)
      canvas.height = Math.round(h * escala)
      canvas.getContext('2d').drawImage(fuente, ((w - dw) / 2) * escala, ((h - dh) / 2) * escala, dw * escala, dh * escala)
      const listo = new Promise(res => { el.onload = el.onerror = res })
      el.style.objectFit = 'fill'
      el.src = canvas.toDataURL('image/png')
      await listo
    } catch { /* si falla se deja la imagen original */ }
  }))
}

async function renderizarCanvas(nodo) {
  const contenedor = document.createElement('div')
  contenedor.style.cssText = `position:fixed;left:-10000px;top:0;width:${ANCHO_PX}px;`
  const clon = nodo.cloneNode(true)
  clon.className = 'ticket-preview'
  clon.style.cssText = 'display:block;width:100%;max-width:none;border:none;box-shadow:none;border-radius:0;padding:12px;'
  contenedor.appendChild(clon)
  document.body.appendChild(contenedor)
  try {
    await Promise.all([...clon.querySelectorAll('img')].map(img =>
      img.complete ? null : new Promise(res => { img.onload = img.onerror = res })))
    await rasterizarImagenes(clon, 3)
    return await html2canvas(clon, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false })
  } finally {
    contenedor.remove()
  }
}

function dispararDescarga(href, nombre) {
  const a = document.createElement('a')
  a.href = href
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// formato: 'pdf' | 'jpg'
export async function descargarTicket(nodo, formato, nombreBase = 'ticket') {
  if (!nodo) throw new Error('No se encontró el ticket para descargar')
  const canvas = await renderizarCanvas(nodo)
  const nombre = nombreBase.replace(/[^\w.-]+/g, '_')

  if (formato === 'jpg') {
    dispararDescarga(canvas.toDataURL('image/jpeg', 0.92), `${nombre}.jpg`)
    return
  }

  const altoMm = (canvas.height * ANCHO_MM) / canvas.width
  const pdf = new jsPDF({ unit: 'mm', format: [ANCHO_MM, altoMm], orientation: 'portrait' })
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, ANCHO_MM, altoMm)
  pdf.save(`${nombre}.pdf`)
}
