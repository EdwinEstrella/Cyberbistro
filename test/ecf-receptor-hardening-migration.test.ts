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

  it("deletes existing duplicate rejected rows before creating their unique index", () => {
    const del = code.indexOf("DELETE FROM public.ecf_received_documents");
    expect(del).toBeGreaterThan(-1);
    expect(del).toBeLessThan(code.indexOf("ecf_received_documents_rejected_uidx"));
    expect(code).toContain("(a.received_at, a.id) > (b.received_at, b.id)");
  });

  it("keys approvals by buyer too, after removing older duplicates", () => {
    expect(code.indexOf("DELETE FROM public.ecf_received_approvals")).toBeLessThan(code.indexOf("ecf_received_approvals_uidx"));
    expect(code).toContain("AND a.comprador_rnc = b.comprador_rnc");
    expect(code).toMatch(/UNIQUE INDEX IF NOT EXISTS ecf_received_approvals_uidx[\s\S]*\(tenant_id, emisor_rnc, encf, comprador_rnc\)/);
  });

  it("schedules the purge only when pg_cron exists and never creates the extension", () => {
    expect(code).toContain("extname = 'pg_cron'");
    expect(code).toContain("cron.schedule('ecf-receptor-purge-expired'");
    expect(code).not.toMatch(/CREATE EXTENSION/i);
    expect(code).toContain("RAISE NOTICE");
  });

  it("adds signer evidence columns and exposes only the mismatch flag to tenants", () => {
    for (const table of ["ecf_received_documents", "ecf_received_approvals"]) {
      expect(code).toMatch(new RegExp(`ALTER TABLE public\\.${table}[\\s\\S]*?signer_rnc_mismatch boolean NOT NULL DEFAULT false`));
      expect(code).toContain(`GRANT SELECT (signer_rnc_mismatch) ON public.${table} TO authenticated`);
    }
    const grants = code.match(/\bGRANT\b[^;]*;/gi) ?? [];
    expect(grants).toHaveLength(2);
    expect(grants.join(" ")).not.toMatch(/signer_ids|signer_serial|INSERT|UPDATE|DELETE/);
  });
});
