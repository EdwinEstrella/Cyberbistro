import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261017170000_ecf_receptor_hardening.sql", "utf8");
const code = sql.replace(/^--.*$/gm, "");

describe("ecf receptor hardening migration", () => {
  it("keeps only a hash for rejected documents and collapses identical repeats", () => {
    expect(code).toContain("ALTER COLUMN xml DROP NOT NULL");
    expect(code).toContain("ALTER COLUMN xml_sha256 SET NOT NULL");
    expect(code).toContain("CHECK (estado = 1 OR xml IS NOT NULL)");
    expect(code).toMatch(/UNIQUE INDEX IF NOT EXISTS ecf_received_documents_rejected_uidx[\s\S]*\(tenant_id, xml_sha256, motivo_no_recibido\) WHERE estado = 1/);
  });

  it("allows one approval per tenant, emisor and eNCF after removing older duplicates", () => {
    expect(code.indexOf("DELETE FROM public.ecf_received_approvals")).toBeLessThan(code.indexOf("ecf_received_approvals_uidx"));
    expect(code).toMatch(/UNIQUE INDEX IF NOT EXISTS ecf_received_approvals_uidx[\s\S]*\(tenant_id, emisor_rnc, encf\)/);
  });

  it("schedules the purge only when pg_cron exists and never creates the extension", () => {
    expect(code).toContain("extname = 'pg_cron'");
    expect(code).toContain("cron.schedule('ecf-receptor-purge-expired'");
    expect(code).not.toMatch(/CREATE EXTENSION/i);
    expect(code).toContain("RAISE NOTICE");
  });

  it("grants nothing to client roles", () => {
    expect(code).not.toMatch(/\bGRANT\b/i);
  });
});
