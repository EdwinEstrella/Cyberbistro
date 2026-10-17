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

  it("deletes the previous certificate object only after the new one is saved", () => {
    const readPrevious = edgeFunction.indexOf('.select("storage_ref")');
    const upsert = edgeFunction.indexOf('.upsert({');
    const remove = edgeFunction.indexOf('.remove([previousRef])');
    expect(readPrevious).toBeGreaterThan(-1);
    expect(readPrevious).toBeLessThan(upsert);
    expect(upsert).toBeLessThan(remove);
    expect(edgeFunction).toContain("previousRef !== storagePath");
    expect(edgeFunction).toContain("previousRef.startsWith(`${tenantId}/`)");
  });

  it("keeps a failed deletion non-fatal and free of secrets", () => {
    expect(edgeFunction).toMatch(/if \(removeError\) console\.warn\("[^"$]*"\);/);
    const start = edgeFunction.indexOf(".remove([previousRef])");
    const end = edgeFunction.indexOf("return Response.json({ success: true");
    expect(end).toBeGreaterThan(start);
    expect(edgeFunction.slice(start, end)).not.toContain("throw");
  });

  it("removes the just-uploaded object when validation fails, never the stored certificate", () => {
    const helper = edgeFunction.indexOf("const rejectUpload");
    const parse = edgeFunction.indexOf("new P12Reader(passphrase)");
    const body = edgeFunction.slice(helper, parse);
    expect(helper).toBeGreaterThan(-1);
    expect(helper).toBeLessThan(parse);
    expect(body).toContain(".remove([storagePath])");
    expect(body).toContain("storagePath.startsWith(`${tenantId}/`)");
    expect(body).toContain("storagePath !== currentRef");
    expect(body).not.toContain("remove([currentRef");
    // Non-fatal: the cleanup is wrapped and the original error code is always thrown afterwards.
    expect(body).toContain("catch {");
    expect(body).toMatch(/throw new HttpError\(400, message, code\);\s*\};/);
  });

  it("removes the just-uploaded object when the metadata save fails, never the stored certificate", () => {
    const start = edgeFunction.indexOf("if (insertError) {");
    const end = edgeFunction.indexOf('"SAVE_FAILED");', start);
    const body = edgeFunction.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain(".remove([storagePath])");
    expect(body).toContain("storagePath.startsWith(`${tenantId}/`)");
    expect(body).toContain("storagePath !== previousRef");
    expect(body).toContain("catch {");
  });

  it("rejects wrong password, invalid file and expired certificates through the cleanup", () => {
    for (const code of ["WRONG_PASSWORD", "INVALID_FILE", "CERTIFICATE_EXPIRED"]) {
      expect(edgeFunction).toMatch(new RegExp(`return await rejectUpload\\([^)]*"${code}"\\)`));
      expect(edgeFunction).not.toMatch(new RegExp(`throw new HttpError\\(400, [^)]*"${code}"\\)`));
    }
  });

  it("returns machine-readable error codes the UI maps to actions", () => {
    for (const code of ["WRONG_PASSWORD", "INVALID_FILE", "CERTIFICATE_EXPIRED", "FORBIDDEN", "SAVE_FAILED"]) {
      expect(edgeFunction).toContain(`"${code}"`);
    }
    expect(edgeFunction).toContain("{ error: message, code }");
  });
});
