import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  PostgresFiscalWorkerRepository,
  type Queryable,
} from "../worker/fiscal/postgresFiscalWorkerRepository";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261106050000_ecf_documents_dgii_security_code.sql"
);

describe("ecf_documents.dgii_security_code migration", () => {
  it("exists and adds a nullable text column idempotently", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /ALTER TABLE public\.ecf_documents\s+ADD COLUMN IF NOT EXISTS dgii_security_code text;/
    );
    expect(sql).not.toMatch(/NOT NULL/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/UPDATE public\.ecf_documents/i);
    expect(sql).not.toMatch(/CREATE POLICY|ALTER POLICY|GRANT |REVOKE /i);
  });

  it("ensures dgii_security_code is in the worker's updateDocument whitelist and targets the correct column", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const db = { query } as unknown as Queryable;
    const repository = new PostgresFiscalWorkerRepository({ db });

    await repository.updateDocument("doc-456", {
      dgiiSecurityCode: "X1Y2Z3",
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sqlQuery, params] = query.mock.calls[0] as [string, unknown[]];

    expect(sqlQuery).toContain("UPDATE public.ecf_documents SET");
    expect(sqlQuery).toContain("dgii_security_code = $2");
    expect(sqlQuery).toContain("WHERE id = $1");
    expect(params).toEqual(["doc-456", "X1Y2Z3"]);
  });
});
