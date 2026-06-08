# Propuesta — PR 3: Migración Inventario Avanzado (Campos SQL)

**Change**: `advanced-inventory-columns`
**Branch**: `feature/advanced-inventory-columns`

---

## Objetivos del Cambio

1. Añadir los campos `ml_por_botella` y `costo_compra` a la tabla `productos_inventario` en PostgreSQL para posibilitar el inventario por presentación en el frontend (PR 4) y el registro de compras (PR 5).
2. Proteger las nuevas columnas mediante el trigger `trg_guard_productos_inventario_update` para impedir modificaciones por parte de usuarios sin rol de administrador.
3. Actualizar la interfaz TypeScript del frontend para asegurar la consistencia y la ausencia de errores de compilación.
4. Crear pruebas unitarias que garanticen que la migración se definió correctamente y previene regresiones.

---

## Modificaciones de Base de Datos (SQL)

La migración se realizará mediante un archivo SQL con el siguiente contenido:

```sql
-- 1. Añadir las columnas ml_por_botella y costo_compra
ALTER TABLE public.productos_inventario 
ADD COLUMN IF NOT EXISTS ml_por_botella numeric,
ADD COLUMN IF NOT EXISTS costo_compra numeric DEFAULT 0.00;

-- 2. Reemplazar la función trigger para proteger las nuevas columnas
CREATE OR REPLACE FUNCTION public.cyberbistro_guard_productos_inventario_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.cyberbistro_has_tenant_role(OLD.tenant_id, ARRAY['admin']) THEN
    RETURN NEW;
  END IF;

  IF NOT public.cyberbistro_has_tenant_role(OLD.tenant_id, ARRAY['cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero']) THEN
    RAISE EXCEPTION 'No tienes permiso para actualizar inventario.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id
    OR NEW.nombre IS DISTINCT FROM OLD.nombre
    OR NEW.categoria IS DISTINCT FROM OLD.categoria
    OR NEW.unidad_base IS DISTINCT FROM OLD.unidad_base
    OR NEW.stock_minimo IS DISTINCT FROM OLD.stock_minimo
    OR NEW.costo_promedio IS DISTINCT FROM OLD.costo_promedio
    OR NEW.ml_por_botella IS DISTINCT FROM OLD.ml_por_botella
    OR NEW.costo_compra IS DISTINCT FROM OLD.costo_compra
    OR NEW.activo IS DISTINCT FROM OLD.activo
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Solo admin puede cambiar datos de catálogo de inventario.';
  END IF;

  RETURN NEW;
END;
$$;
```

---

## Modificaciones de Frontend (TS)

En `src/features/inventario/components/Inventario.tsx`:
```typescript
interface InsumoRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  nombre: string;
  categoria: string;
  unidad_base: string;
  stock_actual: number;
  stock_minimo: number;
  costo_promedio: number;
  activo: boolean;
  ml_por_botella: number | null;
  costo_compra: number | null;
}
```

---

## Análisis de Riesgos

- **Riesgo**: Que los registros existentes tengan valores `NULL` en `ml_por_botella` y esto cause errores en pantallas del frontend si no se maneja correctamente.
  - *Mitigación*: Las nuevas columnas aceptan `NULL` y los componentes de visualización deben tratar `NULL` o `0` como productos sin presentación avanzada (unidad simple).
- **Riesgo**: Que la migración no se aplique localmente a la base de datos de pruebas o de desarrollo.
  - *Mitigación*: Se creará un test automatizado con Vitest para validar el archivo SQL de la migración y se ejecutará el comando de migración local antes de continuar.
