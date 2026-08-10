import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationFile = "20260809180000_local-sync-foundation.sql";
const migrationPath = join(process.cwd(), "migrations", migrationFile);

function migration(): string {
  return readFileSync(migrationPath, "utf8");
}

describe("local sync foundation migration", () => {
  it("adds only isolated protocol objects through the migration transaction", () => {
    expect(existsSync(migrationPath)).toBe(true);

    const sql = migration();
    expect(sql).toContain("CREATE TABLE public.sync_tenants");
    expect(sql).toContain("CREATE TABLE public.sync_operations");
    expect(sql).toContain("CREATE TABLE public.sync_stream_heads");
    expect(sql).toContain("CREATE TABLE public.sync_events");
    expect(sql).toContain("CREATE TABLE public.sync_devices");
    expect(sql).toContain("CREATE INDEX sync_events_tenant_cursor_idx");
    expect(sql).not.toMatch(/\b(?:ALTER|DROP|TRUNCATE)\s+TABLE\s+public\.(?!sync_)/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+INTO\s+public\.(?!sync_)/i);
    expect(sql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER/i);
    expect(sql).not.toMatch(/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;\s*$/im);
  });

  it("defaults every tenant to disabled and keeps protocol tables inaccessible directly", () => {
    const sql = migration();
    const tables = ["sync_tenants", "sync_operations", "sync_stream_heads", "sync_events", "sync_devices"];

    expect(sql).toMatch(/enabled boolean not null default false/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.sync_tenants/i);
    for (const table of tables) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon, authenticated`);
    }
  });

  it("exposes only authenticated, search-path-pinned RPC contracts that reject disabled synchronization", () => {
    const sql = migration();
    const functions = [
      "cloudix_sync_push(p_operation jsonb)",
      "cloudix_sync_pull(p_tenant_id uuid, p_device_id uuid, p_after_cursor bigint, p_limit integer)",
      "cloudix_sync_ack(p_tenant_id uuid, p_device_id uuid, p_cursor bigint)",
      "cloudix_sync_capabilities(p_tenant_id uuid)",
    ];

    for (const signature of functions) {
      expect(sql).toContain(`FUNCTION public.${signature}`);
      expect(sql).toContain("SECURITY DEFINER");
      expect(sql).toContain("SET search_path = pg_catalog, public, pg_temp");
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated`);
    }

    expect(sql.match(/sync_disabled/g)).toHaveLength(4);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?public\.(?!sync_)/i);
  });
});
