# 20260907120000_add_items_plan_alquiler_y_remision

Parte de la rama `feature/remisiones-alquiler`. Agrega el detalle de ítems del
plan a las remisiones de alquiler.

## Qué cambia en la base

| Objeto | Tipo | Nota |
|---|---|---|
| `plan_alquiler_items` | tabla nueva | plantilla de ítems por plan |
| `items_alquiler` | tabla nueva | ítems copiados a cada contrato + serie que carga el repartidor |
| `entregas.observacionEquipoAlquiler` | columna nueva (TEXT, nullable) | nota de estado físico del equipo |

Es 100% aditiva: no altera columnas existentes, no migra datos, no toca
`planes_alquiler` ni `alquileres`.

## Rollback (descartar la feature)

Prisma 5 no ejecuta un `down` automáticamente. El archivo `down.sql` de esta
carpeta hace la reversión completa:

```bash
cd backend
psql "$DATABASE_URL" -f prisma/migrations/20260907120000_add_items_plan_alquiler_y_remision/down.sql
npx prisma migrate resolve --rolled-back 20260907120000_add_items_plan_alquiler_y_remision
git checkout develop            # volver a la rama de pruebas
git branch -D feature/remisiones-alquiler
npx prisma generate             # regenerar el client sin los modelos nuevos
```

Después de eso la base y el código quedan igual que antes de la feature.
