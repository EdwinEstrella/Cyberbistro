import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261017120000_ecf_certificate_cloud_custody.sql"),
  "utf8",
);
const edgeFunction = readFileSync(
  join(process.cwd(), "supabase", "functions", "validate-ecf-certificate", "index.ts"),
  "utf8",
);

describe("e-CF certificate cloud custody migration", () => {
  it("adds the columns the edge function writes and the worker reads, idempotently", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS storage_ref text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS password_encrypted text");
    expect(edgeFunction).toContain("storage_ref: storagePath");
    expect(edgeFunction).toContain("password_encrypted: encryptedPassphrase");
  });

  it("supports the edge function upsert conflict target", () => {
    expect(edgeFunction).toContain('onConflict: "tenant_id,environment"');
    expect(migration).toMatch(/UNIQUE INDEX IF NOT EXISTS[\s\S]*\(tenant_id, environment\)/);
  });

  it("keeps the bucket private and only lets tenant admins insert", () => {
    expect(migration).toContain("'fiscal_certificates', 'fiscal_certificates', false");
    expect(migration).toContain("FOR INSERT");
    expect(migration).not.toMatch(/FOR (SELECT|UPDATE|DELETE|ALL)/);
  });

  it("never grants the sensitive columns to client roles", () => {
    expect(migration).not.toMatch(/GRANT[^;]*password_encrypted/);
  });
});
