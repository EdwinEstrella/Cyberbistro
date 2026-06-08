# Archive Report — PR 3: Migración Inventario Avanzado (Campos SQL)

**Change**: `advanced-inventory-columns`
**Status**: `archived`
**Merged to**: `master`

---

## Resumen Ejecutivo

La tercera unidad de cambio correspondiente a la actualización del plan Profesional de Cyberbistro ha sido completada y archivada.

Se han incorporado las columnas `ml_por_botella` y `costo_compra` a la base de datos de inventario y se ha extendido la protección del trigger de catálogo. Todos los test unitarios y validaciones de TypeScript han concluido con éxito (100% de aprobación). El codebase continúa listo para producción.

---

## Impacto en el Código

- **Migraciones SQL**: Creada `migrations/20260608150000_add-advanced-inventory-columns.sql`.
- **Triggers DB**: Actualizada la función `cyberbistro_guard_productos_inventario_update` en PostgreSQL.
- **TypeScript**: Modificada la interfaz `InsumoRow` en `src/features/inventario/components/Inventario.tsx`.
- **Tests**: Añadido suite de pruebas unitarias `test/advanced-inventory-migration.test.ts`.

---

## Próximas Unidades de Cambio

Siguiendo el grafo de dependencias de `module-architecture.md`:
1. **PR 4: UI inventario por presentación** — Implementar campos en el formulario de creación/edición de insumos, visualización en el listado de stock convirtiendo ml a botellas físicas y costo por ml, y costeo de recetas en la interfaz.
