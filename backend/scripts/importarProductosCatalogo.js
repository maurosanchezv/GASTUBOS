// gastubos/backend/scripts/importarProductosCatalogo.js
// Precarga el maestro de Producto con el catálogo público de pms.com.py, como
// punto de partida editable para la ventana de Venta de Productos.
// Uso: node scripts/importarProductosCatalogo.js
//
// Es un upsert por `codigo` (clave natural del catálogo externo), así que es
// re-ejecutable — pero volver a correrlo sobrescribe nombre/categoría/precio
// de cualquier producto que ya haya sido editado a mano en el maestro con el
// mismo código. Correrlo solo intencionalmente, no como parte del deploy.
import { prisma } from '../src/utils/prisma.js'

const API_BASE = 'https://pms.com.py/api/productos.php'

async function importar() {
  console.log('📦 Importando catálogo desde', API_BASE, '...')

  const resCategorias = await fetch(`${API_BASE}/categorias`)
  const jsonCategorias = await resCategorias.json()
  if (!jsonCategorias.success) throw new Error('No se pudo obtener las categorías del catálogo')
  console.log(`   ${jsonCategorias.data.length} categorías encontradas en el catálogo`)

  const resProductos = await fetch(`${API_BASE}/productos?limit=1000`)
  const jsonProductos = await resProductos.json()
  if (!jsonProductos.success) throw new Error('No se pudo obtener los productos del catálogo')
  const productos = jsonProductos.data.productos
  console.log(`   ${productos.length} productos encontrados en el catálogo`)

  let creados = 0, actualizados = 0, errores = 0

  for (const p of productos) {
    if (!p.codigo || !p.nombre) {
      console.warn(`   ⚠️  Fila sin código o nombre, omitida (id catálogo: ${p.id})`)
      errores++
      continue
    }
    try {
      const data = {
        nombre:          p.nombre,
        descripcion:     p.descripcion || null,
        categoria:       p.categoria,
        categoriaNombre: p.categoria_nombre || null,
        precio:          Number(p.precio) || 0,
        unidad:          p.unidad || 'unidades',
        stock:           p.stock ?? null,
        stockMinimo:     p.stock_minimo ?? null,
        activo:          p.activo !== false,
      }
      const existente = await prisma.producto.findUnique({ where: { codigo: p.codigo } })
      await prisma.producto.upsert({
        where: { codigo: p.codigo },
        update: data,
        create: { codigo: p.codigo, ...data },
      })
      existente ? actualizados++ : creados++
    } catch (err) {
      console.error(`   ❌ Error importando código "${p.codigo}" (${p.nombre}):`, err.message)
      errores++
    }
  }

  console.log(`✅ Importación terminada: ${creados} creados, ${actualizados} actualizados, ${errores} errores.`)
}

importar()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
