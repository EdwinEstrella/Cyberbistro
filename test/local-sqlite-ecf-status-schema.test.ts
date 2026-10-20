import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ECF_DOCUMENT_STATUSES, FISCAL_OUTBOX_STATUSES, initializeTenantSchema } from "../electron/persistence/schema";
import { TenantStore } from "../electron/persistence/tenantStore";

function withStore(run: (store: TenantStore) => void): void {
  const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-ecf-status-"));
  try {
    const store = TenantStore.open({ dataRoot, tenantId: "tenant-a" });
    run(store);
    store.close();
  } finally {
    try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows can retain SQLite handles briefly. */ }
  }
}

function checkoutWrites(documentStatus: string, outboxStatus: string, suffix: string) {
  const base = { tenantId: "tenant-a", op: "insert" as const, deviceId: "device-1" };
  return [
    { ...base, tableName: "facturas", rowId: `f-${suffix}`, payload: { id: `f-${suffix}`, sucursal_id: "main-process-default", fiscal_mode: "dgii_ecf", total: 118, subtotal: 100, itbis: 18 } },
    { ...base, tableName: "ecf_documents", rowId: `d-${suffix}`, payload: { id: `d-${suffix}`, factura_id: `f-${suffix}`, sucursal_id: "main-process-default", ecf_type: "E32", status: documentStatus } },
    { ...base, tableName: "fiscal_outbox", rowId: `o-${suffix}`, payload: { id: `o-${suffix}`, factura_id: `f-${suffix}`, ecf_document_id: `d-${suffix}`, sucursal_id: "main-process-default", operation: "submit", status: outboxStatus } },
  ];
}

describe("local e-CF status vocabulary", () => {
  it("commits a dgii_ecf checkout written with the statuses the fiscal engine emits", () => {
    withStore((store) => {
      expect(store.commitCheckout({ tenantId: "tenant-a", writes: checkoutWrites("pending_offline", "pending_sync", "1") }))
        .toMatchObject({ localStatus: "committed" });
      expect(store.commitCheckout({ tenantId: "tenant-a", writes: checkoutWrites("pending_configuration", "blocked_configuration", "2") }))
        .toMatchObject({ localStatus: "committed" });
    });
  });
});

const OLD_FISCAL_DDL = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE tenant_identity (id TEXT PRIMARY KEY CHECK (id = 'tenant-a')) STRICT;
  INSERT INTO tenant_identity (id) VALUES ('tenant-a');
  CREATE TABLE tenants (id TEXT PRIMARY KEY REFERENCES tenant_identity(id)) STRICT;
  INSERT INTO tenants (id) VALUES ('tenant-a');
  CREATE TABLE sucursales (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL) STRICT;
  INSERT INTO sucursales (id, tenant_id, name) VALUES ('branch-a', 'tenant-a', 'Main');
  CREATE TABLE facturas (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
    fiscal_mode TEXT NOT NULL CHECK (fiscal_mode IN ('internal_receipt', 'ncf_legacy', 'dgii_ecf')),
    total REAL NOT NULL CHECK (total >= 0),
    local_status TEXT NOT NULL CHECK (local_status IN ('committed', 'pending_sync'))
  ) STRICT;
  INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status) VALUES ('f1', 'tenant-a', 'branch-a', 'dgii_ecf', 10, 'pending_sync');
  CREATE TABLE ecf_documents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
    factura_id TEXT NOT NULL UNIQUE REFERENCES facturas(id),
    document_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending_sync', 'pending_processing')),
    certificate_metadata_id TEXT,
    created_at TEXT,
    updated_at TEXT
  ) STRICT;
  INSERT INTO ecf_documents VALUES ('d1', 'tenant-a', 'branch-a', 'f1', 'E32', 'pending_sync', 'cert-1', '2026-01-01', '2026-01-02');
  CREATE TABLE fiscal_outbox (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
    factura_id TEXT NOT NULL REFERENCES facturas(id),
    ecf_document_id TEXT,
    operation TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'syncing')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    idempotency_key TEXT,
    created_at TEXT,
    updated_at TEXT
  ) STRICT;
  INSERT INTO fiscal_outbox VALUES ('o1', 'tenant-a', 'branch-a', 'f1', 'd1', 'submit', 'syncing', 3, '2026-01-03', 'key-1', '2026-01-01', '2026-01-02');
`;

describe("local e-CF status schema migration", () => {
  const columnsOf = (database: DatabaseSync, table: string): string[] =>
    (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name);

  it("rebuilds an old-schema database preserving rows, widening the CHECKs and adding signed columns", () => {
    const database = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    try {
      database.exec(OLD_FISCAL_DDL);
      initializeTenantSchema(database, "tenant-a");

      expect(database.prepare("SELECT * FROM ecf_documents").all()).toEqual([
        expect.objectContaining({ id: "d1", factura_id: "f1", document_type: "E32", status: "pending_sync", certificate_metadata_id: "cert-1", created_at: "2026-01-01", updated_at: "2026-01-02", signed_xml: null, xml_hash: null, dgii_security_code: null, signed_at: null, signed_by_device: null }),
      ]);
      expect(database.prepare("SELECT * FROM fiscal_outbox").all()).toEqual([
        expect.objectContaining({ id: "o1", ecf_document_id: "d1", operation: "submit", status: "syncing", attempts: 3, next_attempt_at: "2026-01-03", idempotency_key: "key-1" }),
      ]);
      expect(columnsOf(database, "ecf_documents")).toEqual(expect.arrayContaining(["signed_xml", "xml_hash", "dgii_security_code", "signed_at", "signed_by_device"]));

      database.prepare("INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status) VALUES ('f2', 'tenant-a', 'branch-a', 'dgii_ecf', 10, 'pending_sync')").run();
      for (const [index, status] of ECF_DOCUMENT_STATUSES.entries()) {
        database.prepare("INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status) VALUES (?, 'tenant-a', 'branch-a', 'f2', 'E32', ?)").run(`d-s${index}`, status);
        database.prepare("DELETE FROM ecf_documents WHERE id = ?").run(`d-s${index}`);
      }
      for (const [index, status] of FISCAL_OUTBOX_STATUSES.entries()) {
        database.prepare("INSERT INTO fiscal_outbox (id, tenant_id, sucursal_id, factura_id, status) VALUES (?, 'tenant-a', 'branch-a', 'f1', ?)").run(`o-s${index}`, status);
      }
      expect(() => database.prepare("INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status) VALUES ('bad', 'tenant-a', 'branch-a', 'f2', 'E32', 'bogus')").run()).toThrow(/CHECK/);
      expect(() => database.prepare("INSERT INTO fiscal_outbox (id, tenant_id, sucursal_id, factura_id, status) VALUES ('bad', 'tenant-a', 'branch-a', 'f1', 'bogus')").run()).toThrow(/CHECK/);

      const indexes = (database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('idx_ecf_documents_pending', 'idx_fiscal_outbox_pending') ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
      expect(indexes).toEqual(["idx_ecf_documents_pending", "idx_fiscal_outbox_pending"]);
    } finally {
      database.close();
    }
  });

  it("is idempotent: a second initialization leaves tables and rows unchanged", () => {
    const database = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    try {
      database.exec(OLD_FISCAL_DDL);
      initializeTenantSchema(database, "tenant-a");
      const snapshot = () => ({
        ddl: database.prepare("SELECT name, sql FROM sqlite_master WHERE name IN ('ecf_documents', 'fiscal_outbox') ORDER BY name").all(),
        docs: database.prepare("SELECT * FROM ecf_documents").all(),
        outbox: database.prepare("SELECT * FROM fiscal_outbox").all(),
      });
      const first = snapshot();
      initializeTenantSchema(database, "tenant-a");
      expect(snapshot()).toEqual(first);
      expect(database.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%legacy_migration%'").all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
