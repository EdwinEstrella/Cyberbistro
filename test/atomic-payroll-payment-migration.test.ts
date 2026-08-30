import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "migrations/20260830002208_register-atomic-payroll-payment.sql",
  "utf8",
);

describe("atomic payroll payment migration", () => {
  it("serializes payments on the employee and validates authorization before writing", () => {
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("public.cyberbistro_has_tenant_role(v_employee.tenant_id, ARRAY['admin', 'contabilidad'])");
    expect(migration).toContain("IF p_monto_pagado > v_pending_cents THEN");
    expect(migration).toContain("INSERT INTO public.nomina_pagos");
  });

  it("exposes only the authenticated RPC surface and leaves no client-side transaction boundary", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog, public, pg_temp");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.register_nomina_pago");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.register_nomina_pago(uuid, text, bigint, bigint, bigint) TO authenticated");
  });
});
