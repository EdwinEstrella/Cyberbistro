import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261018120000_add_tenants_ecf_representative_id.sql", "utf8");

describe("tenants.ecf_representative_id migration", () => {
  it("adds a nullable text column idempotently", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS ecf_representative_id text;/);
    expect(sql).not.toMatch(/NOT NULL/);
    expect(sql).not.toMatch(/DROP COLUMN|UPDATE public\.tenants/i);
  });

  it("only allows NULL or exactly 11 digits", () => {
    expect(sql).toContain("ecf_representative_id IS NULL OR ecf_representative_id ~ '^[0-9]{11}$'");
  });

  it("does not touch functions", () => {
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION");
  });
});
