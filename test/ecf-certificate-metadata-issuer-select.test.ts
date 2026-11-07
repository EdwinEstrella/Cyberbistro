import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261106130000_issuer_select_certificate_metadata.sql"
);

describe("least-privilege SELECT policy on ecf_certificate_metadata migration", () => {
  it("drops old admin-only, previous issuer, and overly broad member policies", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain(
      "DROP POLICY IF EXISTS cb_ecf_certificate_metadata_admin_select ON public.ecf_certificate_metadata;"
    );
    expect(migration).toContain(
      "DROP POLICY IF EXISTS cb_ecf_certificate_metadata_issuer_select ON public.ecf_certificate_metadata;"
    );
    expect(migration).toContain(
      "DROP POLICY IF EXISTS cb_ecf_certificate_metadata_member_select ON public.ecf_certificate_metadata;"
    );
  });

  it("creates the issuer SELECT policy with cyberbistro_has_tenant_role and the six issuer roles", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(
      /CREATE\s+POLICY\s+cb_ecf_certificate_metadata_issuer_select\s+ON\s+public\.ecf_certificate_metadata\s+FOR\s+SELECT\s+TO\s+authenticated/i
    );
    expect(migration).toContain("public.cyberbistro_has_tenant_role");

    const expectedRoles = ["admin", "cajera", "cajero", "ventas", "vender", "vendedor"];
    const match = migration.match(/cyberbistro_has_tenant_role\s*\(\s*tenant_id\s*,\s*ARRAY\[(.*?)\]/s);
    expect(match).not.toBeNull();

    const rolesInArray = [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    expect(rolesInArray).toEqual(expectedRoles);
  });

  it("is wrapped in a transaction block BEGIN ... COMMIT", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(/\bBEGIN;\s*/);
    expect(migration).toMatch(/\bCOMMIT;\s*$/m);
  });

  it("does not contain unprivileged roles (mesero, cocina, contabilidad) and does not issue any GRANT statements", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).not.toMatch(/\bmesero\b/i);
    expect(migration).not.toMatch(/\bcocina\b/i);
    expect(migration).not.toMatch(/\bcontabilidad\b/i);
    expect(migration).not.toMatch(/\bGRANT\b/i);
  });
});
