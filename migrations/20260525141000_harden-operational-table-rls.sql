-- Harden RLS on operational configuration and inventory tables.
-- Replaces broad tenant-only FOR ALL policies with action-specific role policies.

-- Operational stock updates still happen from the app. Protect catalog columns with a trigger
-- because RLS cannot restrict which columns a role updates.
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
    OR NEW.activo IS DISTINCT FROM OLD.activo
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Solo admin puede cambiar datos de catálogo de inventario.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_productos_inventario_update ON public.productos_inventario;
CREATE TRIGGER trg_guard_productos_inventario_update
BEFORE UPDATE ON public.productos_inventario
FOR EACH ROW
EXECUTE FUNCTION public.cyberbistro_guard_productos_inventario_update();

-- sucursales: admin can read all branches; staff can only read active branches.
DROP POLICY IF EXISTS cb_sucursales_tenant_isolation ON public.sucursales;
DROP POLICY IF EXISTS cb_sucursales_tenant_select ON public.sucursales;
DROP POLICY IF EXISTS cb_sucursales_admin_insert ON public.sucursales;
DROP POLICY IF EXISTS cb_sucursales_admin_update ON public.sucursales;
DROP POLICY IF EXISTS cb_sucursales_no_app_delete ON public.sucursales;

CREATE POLICY cb_sucursales_tenant_select
ON public.sucursales
FOR SELECT
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
  OR (
    activa IS TRUE
    AND public.cyberbistro_has_tenant_role(tenant_id, ARRAY['cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero'])
  )
);

CREATE POLICY cb_sucursales_admin_insert
ON public.sucursales
FOR INSERT
TO PUBLIC
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
);

CREATE POLICY cb_sucursales_admin_update
ON public.sucursales
FOR UPDATE
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
)
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
);

CREATE POLICY cb_sucursales_no_app_delete
ON public.sucursales
FOR DELETE
TO PUBLIC
USING (false);

-- productos_inventario: admin manages catalog; operational roles may update stock through sale/kitchen flows.
DROP POLICY IF EXISTS cb_productos_inventario_tenant_isolation ON public.productos_inventario;
DROP POLICY IF EXISTS cb_productos_inventario_tenant_select ON public.productos_inventario;
DROP POLICY IF EXISTS cb_productos_inventario_admin_insert ON public.productos_inventario;
DROP POLICY IF EXISTS cb_productos_inventario_stock_update ON public.productos_inventario;
DROP POLICY IF EXISTS cb_productos_inventario_admin_delete ON public.productos_inventario;

CREATE POLICY cb_productos_inventario_tenant_select
ON public.productos_inventario
FOR SELECT
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero'])
);

CREATE POLICY cb_productos_inventario_admin_insert
ON public.productos_inventario
FOR INSERT
TO PUBLIC
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
);

CREATE POLICY cb_productos_inventario_stock_update
ON public.productos_inventario
FOR UPDATE
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero'])
)
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero'])
);

CREATE POLICY cb_productos_inventario_admin_delete
ON public.productos_inventario
FOR DELETE
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
);

-- inventario_movimientos: append-only operational log. Admin and operational flows can insert; no app updates/deletes.
DROP POLICY IF EXISTS cb_inventario_movimientos_tenant_isolation ON public.inventario_movimientos;
DROP POLICY IF EXISTS cb_inventario_movimientos_tenant_select ON public.inventario_movimientos;
DROP POLICY IF EXISTS cb_inventario_movimientos_operational_insert ON public.inventario_movimientos;
DROP POLICY IF EXISTS cb_inventario_movimientos_no_app_update ON public.inventario_movimientos;
DROP POLICY IF EXISTS cb_inventario_movimientos_no_app_delete ON public.inventario_movimientos;

CREATE POLICY cb_inventario_movimientos_tenant_select
ON public.inventario_movimientos
FOR SELECT
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'cocina', 'cocinero'])
);

CREATE POLICY cb_inventario_movimientos_operational_insert
ON public.inventario_movimientos
FOR INSERT
TO PUBLIC
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero'])
);

CREATE POLICY cb_inventario_movimientos_no_app_update
ON public.inventario_movimientos
FOR UPDATE
TO PUBLIC
USING (false)
WITH CHECK (false);

CREATE POLICY cb_inventario_movimientos_no_app_delete
ON public.inventario_movimientos
FOR DELETE
TO PUBLIC
USING (false);

-- recetas: operational roles can read for stock deduction; only admin changes recipes.
DROP POLICY IF EXISTS cb_recetas_tenant_isolation ON public.recetas;
DROP POLICY IF EXISTS cb_recetas_tenant_select ON public.recetas;
DROP POLICY IF EXISTS cb_recetas_admin_insert ON public.recetas;
DROP POLICY IF EXISTS cb_recetas_admin_update ON public.recetas;
DROP POLICY IF EXISTS cb_recetas_admin_delete ON public.recetas;

CREATE POLICY cb_recetas_tenant_select
ON public.recetas
FOR SELECT
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero'])
);

CREATE POLICY cb_recetas_admin_insert
ON public.recetas
FOR INSERT
TO PUBLIC
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
);

CREATE POLICY cb_recetas_admin_update
ON public.recetas
FOR UPDATE
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
)
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
);

CREATE POLICY cb_recetas_admin_delete
ON public.recetas
FOR DELETE
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
);

-- produccion_cocina: kitchen can record production usage; only admin can edit/delete history.
DROP POLICY IF EXISTS cb_produccion_cocina_tenant_isolation ON public.produccion_cocina;
DROP POLICY IF EXISTS cb_produccion_cocina_tenant_select ON public.produccion_cocina;
DROP POLICY IF EXISTS cb_produccion_cocina_operational_insert ON public.produccion_cocina;
DROP POLICY IF EXISTS cb_produccion_cocina_admin_update ON public.produccion_cocina;
DROP POLICY IF EXISTS cb_produccion_cocina_admin_delete ON public.produccion_cocina;

CREATE POLICY cb_produccion_cocina_tenant_select
ON public.produccion_cocina
FOR SELECT
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cocina', 'cocinero'])
);

CREATE POLICY cb_produccion_cocina_operational_insert
ON public.produccion_cocina
FOR INSERT
TO PUBLIC
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cocina', 'cocinero'])
);

CREATE POLICY cb_produccion_cocina_admin_update
ON public.produccion_cocina
FOR UPDATE
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
)
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
);

CREATE POLICY cb_produccion_cocina_admin_delete
ON public.produccion_cocina
FOR DELETE
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
);

-- Accounting tables are not present in the repo schema yet. Guard production-only tables if they exist.
DO $$
BEGIN
  IF to_regclass('public.accounting_accounts') IS NOT NULL THEN
    DROP POLICY IF EXISTS cb_accounting_accounts_tenant_isolation ON public.accounting_accounts;
    DROP POLICY IF EXISTS cb_accounting_accounts_admin_select ON public.accounting_accounts;
    DROP POLICY IF EXISTS cb_accounting_accounts_admin_insert ON public.accounting_accounts;
    DROP POLICY IF EXISTS cb_accounting_accounts_admin_update ON public.accounting_accounts;
    DROP POLICY IF EXISTS cb_accounting_accounts_no_app_delete ON public.accounting_accounts;

    CREATE POLICY cb_accounting_accounts_admin_select ON public.accounting_accounts
      FOR SELECT TO PUBLIC USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));
    CREATE POLICY cb_accounting_accounts_admin_insert ON public.accounting_accounts
      FOR INSERT TO PUBLIC WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));
    CREATE POLICY cb_accounting_accounts_admin_update ON public.accounting_accounts
      FOR UPDATE TO PUBLIC USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']))
      WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));
    CREATE POLICY cb_accounting_accounts_no_app_delete ON public.accounting_accounts
      FOR DELETE TO PUBLIC USING (false);
  END IF;

  IF to_regclass('public.accounting_posting_rules') IS NOT NULL THEN
    DROP POLICY IF EXISTS cb_accounting_posting_rules_tenant_isolation ON public.accounting_posting_rules;
    DROP POLICY IF EXISTS cb_accounting_posting_rules_admin_select ON public.accounting_posting_rules;
    DROP POLICY IF EXISTS cb_accounting_posting_rules_admin_insert ON public.accounting_posting_rules;
    DROP POLICY IF EXISTS cb_accounting_posting_rules_admin_update ON public.accounting_posting_rules;
    DROP POLICY IF EXISTS cb_accounting_posting_rules_no_app_delete ON public.accounting_posting_rules;

    CREATE POLICY cb_accounting_posting_rules_admin_select ON public.accounting_posting_rules
      FOR SELECT TO PUBLIC USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));
    CREATE POLICY cb_accounting_posting_rules_admin_insert ON public.accounting_posting_rules
      FOR INSERT TO PUBLIC WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));
    CREATE POLICY cb_accounting_posting_rules_admin_update ON public.accounting_posting_rules
      FOR UPDATE TO PUBLIC USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']))
      WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));
    CREATE POLICY cb_accounting_posting_rules_no_app_delete ON public.accounting_posting_rules
      FOR DELETE TO PUBLIC USING (false);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
