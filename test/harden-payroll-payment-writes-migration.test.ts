import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "migrations/20260830003136_harden-nomina-payment-writes.sql",
  "utf8",
);

describe("hardened payroll payment writes migration", () => {
  it("removes direct payment DML while preserving the RLS-gated read surface", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.nomina_pagos FROM anon, authenticated");
    expect(migration).toContain("GRANT SELECT ON TABLE public.nomina_pagos TO anon, authenticated");
    expect(migration).toContain("DROP POLICY IF EXISTS cb_nomina_pagos_tenant_insert");
    expect(migration).toContain("DROP POLICY IF EXISTS cb_nomina_pagos_tenant_update");
  });

  it("uses the local payment UUID as an idempotency key inside the same atomic RPC", () => {
    expect(migration).toContain("p_pago_id uuid DEFAULT NULL");
    expect(migration).toContain("IF p_pago_id IS NOT NULL THEN");
    expect(migration).toContain("COALESCE(p_pago_id, gen_random_uuid())");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.register_nomina_pago(uuid, text, bigint, bigint, bigint, uuid) TO authenticated");
  });
});
