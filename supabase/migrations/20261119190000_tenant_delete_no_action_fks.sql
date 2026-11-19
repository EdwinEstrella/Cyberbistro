-- Migration: 20261119190000_tenant_delete_no_action_fks.sql
-- Description: Switch 9 child-to-child foreign keys to ON DELETE NO ACTION
--
-- Why:
-- When public.cloudix_super_admin_delete_tenant(uuid) deletes a tenant, PostgreSQL cascades
-- the deletion from public.tenants to every tenant-owned table (platos, consumos, facturas,
-- compras, cierres_operativos, etc.).
--
-- However, 9 child-to-child foreign keys were blocked by immediate RESTRICT checks during cascade:
--   1. compras.compras_cycle_id_fkey        -> cierres_operativos(id)
--   2. consumos.consumos_plato_id_fkey       -> platos(id)
--   3. cuentas_pagar.cuentas_pagar_cycle_id_fkey -> cierres_operativos(id)
--   4. ecf_documents.ecf_documents_factura_id_fkey -> facturas(id)
--   5. facturas.facturas_credit_note_of_fkey     -> facturas(id)
--   6. fiscal_outbox.fiscal_outbox_factura_id_fkey -> facturas(id)
--   7. menu_links.menu_links_sucursal_id_fkey    -> sucursales(id)
--   8. menu_links.menu_links_menu_id_fkey        -> menus(id)
--   9. menu_links.menu_links_customer_id_fkey    -> customers(id)
--
-- In PostgreSQL:
-- - Immediate RESTRICT checks are evaluated at the moment each row is removed during the cascade.
--   If a referenced row (e.g. platos) is visited before a referencing row (e.g. consumos),
--   the immediate check aborts the transaction with a foreign key violation.
-- - ON DELETE NO ACTION checks referential integrity at the END OF THE STATEMENT. When the tenant-level
--   DELETE FROM public.tenants statement finishes, both the referenced and referencing rows of that
--   tenant have been removed by the cascade, so the statement succeeds cleanly.
--
-- Referential integrity preservation:
-- Standalone deletions of referenced rows (e.g. attempting to delete a plato that has consumos,
-- or a factura with associated e-CF documents) continue to fail at statement end, preserving
-- protection against deleting a referenced row on its own.
--
-- Concurrency & Locking:
-- Constraints are re-added with NOT VALID (avoiding long exclusive table scans) and immediately
-- validated with VALIDATE CONSTRAINT.

-- 1. compras -> cierres_operativos (cycle_id)
ALTER TABLE public.compras
  DROP CONSTRAINT IF EXISTS compras_cycle_id_fkey;
ALTER TABLE public.compras
  ADD CONSTRAINT compras_cycle_id_fkey
  FOREIGN KEY (cycle_id) REFERENCES public.cierres_operativos(id)
  ON DELETE NO ACTION NOT VALID;
ALTER TABLE public.compras
  VALIDATE CONSTRAINT compras_cycle_id_fkey;

-- 2. consumos -> platos (plato_id)
ALTER TABLE public.consumos
  DROP CONSTRAINT IF EXISTS consumos_plato_id_fkey;
ALTER TABLE public.consumos
  ADD CONSTRAINT consumos_plato_id_fkey
  FOREIGN KEY (plato_id) REFERENCES public.platos(id)
  ON DELETE NO ACTION NOT VALID;
ALTER TABLE public.consumos
  VALIDATE CONSTRAINT consumos_plato_id_fkey;

-- 3. cuentas_pagar -> cierres_operativos (cycle_id)
ALTER TABLE public.cuentas_pagar
  DROP CONSTRAINT IF EXISTS cuentas_pagar_cycle_id_fkey;
ALTER TABLE public.cuentas_pagar
  ADD CONSTRAINT cuentas_pagar_cycle_id_fkey
  FOREIGN KEY (cycle_id) REFERENCES public.cierres_operativos(id)
  ON DELETE NO ACTION NOT VALID;
ALTER TABLE public.cuentas_pagar
  VALIDATE CONSTRAINT cuentas_pagar_cycle_id_fkey;

-- 4. ecf_documents -> facturas (factura_id)
ALTER TABLE public.ecf_documents
  DROP CONSTRAINT IF EXISTS ecf_documents_factura_id_fkey;
ALTER TABLE public.ecf_documents
  ADD CONSTRAINT ecf_documents_factura_id_fkey
  FOREIGN KEY (factura_id) REFERENCES public.facturas(id)
  ON DELETE NO ACTION NOT VALID;
ALTER TABLE public.ecf_documents
  VALIDATE CONSTRAINT ecf_documents_factura_id_fkey;

-- 5. facturas -> facturas (credit_note_of)
ALTER TABLE public.facturas
  DROP CONSTRAINT IF EXISTS facturas_credit_note_of_fkey;
ALTER TABLE public.facturas
  ADD CONSTRAINT facturas_credit_note_of_fkey
  FOREIGN KEY (credit_note_of) REFERENCES public.facturas(id)
  ON DELETE NO ACTION NOT VALID;
ALTER TABLE public.facturas
  VALIDATE CONSTRAINT facturas_credit_note_of_fkey;

-- 6. fiscal_outbox -> facturas (factura_id)
ALTER TABLE public.fiscal_outbox
  DROP CONSTRAINT IF EXISTS fiscal_outbox_factura_id_fkey;
ALTER TABLE public.fiscal_outbox
  ADD CONSTRAINT fiscal_outbox_factura_id_fkey
  FOREIGN KEY (factura_id) REFERENCES public.facturas(id)
  ON DELETE NO ACTION NOT VALID;
ALTER TABLE public.fiscal_outbox
  VALIDATE CONSTRAINT fiscal_outbox_factura_id_fkey;

-- 7. menu_links -> sucursales (sucursal_id)
ALTER TABLE public.menu_links
  DROP CONSTRAINT IF EXISTS menu_links_sucursal_id_fkey;
ALTER TABLE public.menu_links
  ADD CONSTRAINT menu_links_sucursal_id_fkey
  FOREIGN KEY (sucursal_id) REFERENCES public.sucursales(id)
  ON DELETE NO ACTION NOT VALID;
ALTER TABLE public.menu_links
  VALIDATE CONSTRAINT menu_links_sucursal_id_fkey;

-- 8. menu_links -> menus (menu_id)
ALTER TABLE public.menu_links
  DROP CONSTRAINT IF EXISTS menu_links_menu_id_fkey;
ALTER TABLE public.menu_links
  ADD CONSTRAINT menu_links_menu_id_fkey
  FOREIGN KEY (menu_id) REFERENCES public.menus(id)
  ON DELETE NO ACTION NOT VALID;
ALTER TABLE public.menu_links
  VALIDATE CONSTRAINT menu_links_menu_id_fkey;

-- 9. menu_links -> customers (customer_id)
ALTER TABLE public.menu_links
  DROP CONSTRAINT IF EXISTS menu_links_customer_id_fkey;
ALTER TABLE public.menu_links
  ADD CONSTRAINT menu_links_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON DELETE NO ACTION NOT VALID;
ALTER TABLE public.menu_links
  VALIDATE CONSTRAINT menu_links_customer_id_fkey;

NOTIFY pgrst, 'reload schema';
