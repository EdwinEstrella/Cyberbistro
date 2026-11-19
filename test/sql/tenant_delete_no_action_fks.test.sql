-- ============================================================
-- Tenant Delete NO ACTION Foreign Keys Test Suite
-- Standalone SQL test (psql -v ON_ERROR_STOP=1)
-- ============================================================

BEGIN;

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Minimal stubs for tables involved in the migration
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_negocio text NOT NULL DEFAULT 'Test Restaurant',
  activa boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.cierres_operativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cycle_id uuid
);

CREATE TABLE IF NOT EXISTS public.cuentas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cycle_id uuid
);

CREATE TABLE IF NOT EXISTS public.platos (
  id serial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.consumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plato_id integer NOT NULL,
  nombre text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_note_of uuid
);

CREATE TABLE IF NOT EXISTS public.ecf_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  factura_id uuid
);

CREATE TABLE IF NOT EXISTS public.fiscal_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  factura_id uuid
);

CREATE TABLE IF NOT EXISTS public.sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.menu_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid,
  menu_id uuid,
  customer_id uuid
);

-- 3. Initial state: add the 9 constraints with RESTRICT to mirror pre-migration production state
ALTER TABLE public.compras DROP CONSTRAINT IF EXISTS compras_cycle_id_fkey;
ALTER TABLE public.compras ADD CONSTRAINT compras_cycle_id_fkey
  FOREIGN KEY (cycle_id) REFERENCES public.cierres_operativos(id) ON DELETE RESTRICT;

ALTER TABLE public.consumos DROP CONSTRAINT IF EXISTS consumos_plato_id_fkey;
ALTER TABLE public.consumos ADD CONSTRAINT consumos_plato_id_fkey
  FOREIGN KEY (plato_id) REFERENCES public.platos(id) ON DELETE RESTRICT;

ALTER TABLE public.cuentas_pagar DROP CONSTRAINT IF EXISTS cuentas_pagar_cycle_id_fkey;
ALTER TABLE public.cuentas_pagar ADD CONSTRAINT cuentas_pagar_cycle_id_fkey
  FOREIGN KEY (cycle_id) REFERENCES public.cierres_operativos(id) ON DELETE RESTRICT;

ALTER TABLE public.ecf_documents DROP CONSTRAINT IF EXISTS ecf_documents_factura_id_fkey;
ALTER TABLE public.ecf_documents ADD CONSTRAINT ecf_documents_factura_id_fkey
  FOREIGN KEY (factura_id) REFERENCES public.facturas(id) ON DELETE RESTRICT;

ALTER TABLE public.facturas DROP CONSTRAINT IF EXISTS facturas_credit_note_of_fkey;
ALTER TABLE public.facturas ADD CONSTRAINT facturas_credit_note_of_fkey
  FOREIGN KEY (credit_note_of) REFERENCES public.facturas(id) ON DELETE RESTRICT;

ALTER TABLE public.fiscal_outbox DROP CONSTRAINT IF EXISTS fiscal_outbox_factura_id_fkey;
ALTER TABLE public.fiscal_outbox ADD CONSTRAINT fiscal_outbox_factura_id_fkey
  FOREIGN KEY (factura_id) REFERENCES public.facturas(id) ON DELETE RESTRICT;

ALTER TABLE public.menu_links DROP CONSTRAINT IF EXISTS menu_links_sucursal_id_fkey;
ALTER TABLE public.menu_links ADD CONSTRAINT menu_links_sucursal_id_fkey
  FOREIGN KEY (sucursal_id) REFERENCES public.sucursales(id) ON DELETE RESTRICT;

ALTER TABLE public.menu_links DROP CONSTRAINT IF EXISTS menu_links_menu_id_fkey;
ALTER TABLE public.menu_links ADD CONSTRAINT menu_links_menu_id_fkey
  FOREIGN KEY (menu_id) REFERENCES public.menus(id) ON DELETE RESTRICT;

ALTER TABLE public.menu_links DROP CONSTRAINT IF EXISTS menu_links_customer_id_fkey;
ALTER TABLE public.menu_links ADD CONSTRAINT menu_links_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;

-- 4. Apply the migration under test
\i supabase/migrations/20261119190000_tenant_delete_no_action_fks.sql

-- 5. Test execution
DO $$
DECLARE
  v_tenant_id uuid;
  v_plato_id integer;
  v_consumo_id uuid;
  v_error_caught boolean := false;
  v_remaining_tenants integer;
  v_remaining_platos integer;
  v_remaining_consumos integer;
BEGIN
  -- Insert test tenant
  INSERT INTO public.tenants (nombre_negocio)
  VALUES ('Test Tenant Delete')
  RETURNING id INTO v_tenant_id;

  -- Insert plato for tenant
  INSERT INTO public.platos (tenant_id, nombre)
  VALUES (v_tenant_id, 'Mofongo Especial')
  RETURNING id INTO v_plato_id;

  -- Insert consumo referencing plato
  INSERT INTO public.consumos (tenant_id, plato_id, nombre)
  VALUES (v_tenant_id, v_plato_id, 'Consumo Mofongo')
  RETURNING id INTO v_consumo_id;

  -- TEST 1: Deleting plato alone MUST FAIL with foreign_key_violation
  BEGIN
    DELETE FROM public.platos WHERE id = v_plato_id;
  EXCEPTION
    WHEN foreign_key_violation THEN
      v_error_caught := true;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected foreign_key_violation when deleting referenced plato alone, but deletion succeeded';
  END IF;

  -- TEST 2: Deleting tenant MUST SUCCEED (cascade deletes both platos and consumos, NO ACTION passes at statement end)
  DELETE FROM public.tenants WHERE id = v_tenant_id;

  SELECT count(*) INTO v_remaining_tenants FROM public.tenants WHERE id = v_tenant_id;
  SELECT count(*) INTO v_remaining_platos FROM public.platos WHERE id = v_plato_id;
  SELECT count(*) INTO v_remaining_consumos FROM public.consumos WHERE id = v_consumo_id;

  IF v_remaining_tenants <> 0 OR v_remaining_platos <> 0 OR v_remaining_consumos <> 0 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Tenant deletion failed to cascade cleanly. Remaining: tenants=%, platos=%, consumos=%',
      v_remaining_tenants, v_remaining_platos, v_remaining_consumos;
  END IF;

  RAISE NOTICE 'ALL TENANT DELETE NO ACTION FK TESTS PASSED SUCCESSFULLY!';
END $$;

ROLLBACK;
