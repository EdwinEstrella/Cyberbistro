import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261017140000_add_tenants_ecf_secuencias_rangos.sql", "utf8");

describe("tenants.ecf_secuencias_rangos migration", () => {
  it("is additive and idempotent, with a jsonb default so existing rows stay valid", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS ecf_secuencias_rangos jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
    expect(sql).not.toMatch(/DROP|ALTER COLUMN|UPDATE public\.tenants/i);
  });

  it("does not touch the reserve RPC or the next-number map", () => {
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION");
    expect(sql).not.toMatch(/ncf_secuencias_por_tipo\s*=/);
  });
});
