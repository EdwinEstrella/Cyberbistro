import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase CLI assets", () => {
  it("keeps the certificate function behind gateway JWT verification", () => {
    const config = readFileSync(join(process.cwd(), "supabase", "config.toml"), "utf8");
    expect(config).toContain("[functions.validate-ecf-certificate]");
    expect(config).toContain("verify_jwt = true");
  });

  it("keeps registration execution restricted in both canonical and forward SQL", () => {
    const canonical = readFileSync(join(process.cwd(), "sql", "cyberbistro_register_tenant.sql"), "utf8");
    const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "20260911200000_harden_certificate_function_and_registration.sql"), "utf8");
    for (const sql of [canonical, migration]) {
      expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.cyberbistro_register_tenant");
      expect(sql).toContain("TO authenticated;");
      expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.cyberbistro_register_tenant[\s\S]*?TO PUBLIC;/);
    }
  });
});
