import { describe, expect, it } from "vitest";
import {
  buildServerWritePayload,
  buildEcfDocumentPayloadForServer,
  buildCierrePayloadWithCycleNumber,
  buildFiscalOutboxPayloadForServer,
  buildFacturaPayloadWithNcfSequence,
  buildLocalTenantNcfReservation,
  buildNcfWithSequence,
  getOutboxAcknowledgementFailure,
  normalizeLegacyCierreOutboxEntry,
  resolveCompraDependencyId,
  resolveSyncFailureRetry,
  buildSyncErrorRow,
  buildLocalMirrorWriteResult,
  buildMirrorStoreResetSyncStateKeys,
  assertCanWriteOffline,
  buildSyncStateKey,
  compareRowsByUpdatedAtThenId,
  decodeIncrementalCursor,
  encodeIncrementalCursor,
  isRowAfterCursor,
  createSyncOutboxEntry,
  createSyncStateRow,
  FULL_REFRESH_ON_SYNC_TABLES,
  getHistoricalSyncIncompleteMessage,
  getTenantReadFilter,
  isLocalFirstEnabled,
  isLicenseValidOffline,
  isLocalFirstMirrorTable,
  LOCAL_FIRST_DB_VERSION,
  LOCAL_FIRST_HISTORY_TABLES,
  LOCAL_FIRST_IMMEDIATE_TABLES,
  LOCAL_FIRST_MIRROR_TABLES,
  LOCAL_FIRST_METADATA_TABLES,
  resolveUpsertConflictTarget,
  resolveLocalWriteMode,
  resolveConflictForTable,
  resolveOutboxConflictGuardrail,
  resolvePurchaseOutboxInsertFailure,
  resolveMirrorStoreKeyPath,
  selectProcessableOutboxEntries,
  shouldReadLocalFirst,
  invalidateLocalSessionContext,
  type LocalLicenseCache,
  type LocalWriteMode,
  type SyncOutboxEntry,
  enqueueLocalWrite,
  enqueueLocalWritesAtomically,
  bootstrapLocalFirstPhase,
  deleteLocalTenantDatabase,
  getLocalDeviceSession,
  getLocalFirstStatusSnapshot,
  loadLicenseCache,
  pushOutboxToServer,
  readLocalMirror,
  readLocalOutbox,
  saveLicenseCache,
  saveLocalDeviceSession,
  syncIncremental,
  syncLanEdge,
  writeLocalMirrorRow,
  processInvoiceInventoryDeduction,
} from "./localFirst";

describe("localFirst", () => {
  it("mantiene tablas mirror y metadata sin inventar entidades de negocio", () => {
    expect(LOCAL_FIRST_MIRROR_TABLES).not.toContain("comandas");
    expect(LOCAL_FIRST_MIRROR_TABLES).not.toContain("mesas_estado");
    expect(LOCAL_FIRST_MIRROR_TABLES).not.toContain("consumos");
    expect(LOCAL_FIRST_MIRROR_TABLES).not.toContain("facturas");
    expect(LOCAL_FIRST_IMMEDIATE_TABLES).not.toContain("facturas");
    expect(LOCAL_FIRST_IMMEDIATE_TABLES).not.toContain("comandas");
    expect(LOCAL_FIRST_IMMEDIATE_TABLES).not.toContain("mesas_estado");
    expect(LOCAL_FIRST_IMMEDIATE_TABLES).not.toContain("consumos");
    expect(LOCAL_FIRST_HISTORY_TABLES).not.toContain("facturas");
    expect(LOCAL_FIRST_HISTORY_TABLES).not.toContain("comandas");
    expect(LOCAL_FIRST_HISTORY_TABLES).not.toContain("mesas_estado");
    expect(LOCAL_FIRST_HISTORY_TABLES).not.toContain("consumos");
    expect(LOCAL_FIRST_MIRROR_TABLES).toContain("ecf_documents");
    expect(LOCAL_FIRST_MIRROR_TABLES).toContain("fiscal_outbox");
    expect(LOCAL_FIRST_MIRROR_TABLES).not.toContain("ecf_certificate_metadata");
    expect(LOCAL_FIRST_IMMEDIATE_TABLES).not.toContain("ecf_certificate_metadata");
    expect(LOCAL_FIRST_HISTORY_TABLES).not.toContain("ecf_certificate_metadata");
    expect(LOCAL_FIRST_MIRROR_TABLES).not.toContain("orders");
    expect(LOCAL_FIRST_MIRROR_TABLES).not.toContain("invoices");
    expect(LOCAL_FIRST_METADATA_TABLES).toContain("sync_outbox");
    expect(LOCAL_FIRST_METADATA_TABLES).toContain("local_fiscal_outbox");
  });

  it("bumps IndexedDB version for fiscal stores added after version 8", () => {
    expect(LOCAL_FIRST_DB_VERSION).toBeGreaterThan(8);
  });

  it("registers fiscal stores so existing tenant databases receive them during upgrade", () => {
    expect(LOCAL_FIRST_MIRROR_TABLES).toEqual(expect.arrayContaining(["ecf_documents", "fiscal_outbox"]));
    expect(LOCAL_FIRST_METADATA_TABLES).toEqual(expect.arrayContaining(["local_fiscal_outbox"]));
    expect(resolveMirrorStoreKeyPath("ecf_documents")).toBe("id");
    expect(resolveMirrorStoreKeyPath("fiscal_outbox")).toBe("id");
  });

  it("incluye el dataset mínimo operativo antes del historial background", () => {
    expect(LOCAL_FIRST_IMMEDIATE_TABLES).toEqual(
      expect.arrayContaining([
        "tenants",
        "tenant_users",
        "platos",
        "cocina_estado",
        "ecf_documents",
        "fiscal_outbox",
      ])
    );
  });

  it("leaves employee child-table isolation to backend RLS and keeps direct tenant filters elsewhere", () => {
    expect(getTenantReadFilter("nomina_pagos", "tenant-1")).toBeNull();
    expect(getTenantReadFilter("nomina_ajustes", "tenant-1")).toBeNull();
    expect(getTenantReadFilter("tenants", "tenant-1")).toEqual({ column: "id", value: "tenant-1" });
    expect(getTenantReadFilter("facturas", "tenant-1")).toEqual({ column: "tenant_id", value: "tenant-1" });
  });

  it("uses a full refresh for employee child tables without updated_at cursors", () => {
    expect(FULL_REFRESH_ON_SYNC_TABLES).toContain("nomina_pagos");
    expect(FULL_REFRESH_ON_SYNC_TABLES).toContain("nomina_ajustes");
  });

  it("genera cursores por tenant, fase y tabla", () => {
    expect(buildSyncStateKey("tenant-1", "facturas", "history")).toBe("tenant-1:history:facturas");
    expect(createSyncStateRow({ tenantId: "tenant-1", tableName: "facturas", phase: "history", completed: true, rowCount: 7 })).toMatchObject({
      key: "tenant-1:history:facturas",
      tenant_id: "tenant-1",
      table_name: "facturas",
      completed: true,
      row_count: 7,
    });
  });

  it("codifica/decodifica cursor incremental compuesto y mantiene compatibilidad", () => {
    const encoded = encodeIncrementalCursor({ updated_at: "2026-01-01T00:00:00.000Z", id: "row-9" });
    expect(decodeIncrementalCursor(encoded)).toEqual({ updated_at: "2026-01-01T00:00:00.000Z", id: "row-9" });

    // backward compatibility: old cursor was timestamp only
    expect(decodeIncrementalCursor("2026-01-01T00:00:00.000Z")).toEqual({
      updated_at: "2026-01-01T00:00:00.000Z",
      id: "",
    });
  });

  it("compara filas y filtra correctamente por cursor compuesto", () => {
    const a = { id: "1", updated_at: "2026-01-01T00:00:00.000Z" };
    const b = { id: "2", updated_at: "2026-01-01T00:00:00.000Z" };
    const c = { id: "0", updated_at: "2026-01-01T00:00:01.000Z" };

    expect(compareRowsByUpdatedAtThenId(a, b)).toBeLessThan(0);
    expect(compareRowsByUpdatedAtThenId(c, b)).toBeGreaterThan(0);

    const cursor = { updated_at: "2026-01-01T00:00:00.000Z", id: "1" };
    expect(isRowAfterCursor(a, cursor)).toBe(false);
    expect(isRowAfterCursor(b, cursor)).toBe(true);
    expect(isRowAfterCursor(c, cursor)).toBe(true);
  });

  it("resuelve keyPath de IndexedDB: id", () => {
    expect(resolveMirrorStoreKeyPath("facturas")).toBe("id");
  });

  it("calcula cursores a resetear cuando se recrea un store mirror", () => {
    expect(buildMirrorStoreResetSyncStateKeys("tenant-1", "facturas")).toEqual([
      "tenant-1:minimum:facturas",
      "tenant-1:history:facturas",
      "tenant-1:incremental:facturas",
    ]);
  });

  it("registra deletes como eventos auditables en sync_outbox", () => {
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "facturas",
      rowId: "factura-1",
      op: "delete",
      authUserId: "auth-1",
      deviceId: "device-1",
    });

    expect(entry).toMatchObject({
      tenant_id: "tenant-1",
      table_name: "facturas",
      row_id: "factura-1",
      op: "delete",
      status: "pending",
      created_by_auth_user_id: "auth-1",
      device_id: "device-1",
    });
  });

  it("expone mensaje cuando una consulta histórica aún puede estar incompleta", () => {
    expect(getHistoricalSyncIncompleteMessage("ready_history_syncing")).toContain("historial antiguo");
    expect(getHistoricalSyncIncompleteMessage("history_complete")).toBeNull();
    expect(isLocalFirstMirrorTable("platos")).toBe(true);
    expect(isLocalFirstMirrorTable("consumos")).toBe(false);
    expect(isLocalFirstMirrorTable("orders")).toBe(false);
  });

  it("desactiva local-first fuera de Electron para que la web lea siempre servidor", async () => {
    expect(isLocalFirstEnabled()).toBe(false);
    await expect(shouldReadLocalFirst("tenant-1", ["cierres_operativos"])).resolves.toBe(false);
  });

  it("mantiene la última autorización activa durante una caída de nube", () => {
    const validCache: LocalLicenseCache = {
      tenant_id: "tenant-1",
      tenant_activa: true,
      tenant_users_activo: true,
      validated_at: new Date().toISOString(),
      window_valid_until: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    };
    expect(isLicenseValidOffline(validCache)).toBe(true);

    const expiredCache: LocalLicenseCache = {
      ...validCache,
      window_valid_until: new Date(Date.now() - 1000).toISOString(),
    };
    expect(isLicenseValidOffline(expiredCache)).toBe(true);

    expect(isLicenseValidOffline(null)).toBe(false);

    const inactiveTenantCache: LocalLicenseCache = { ...validCache, tenant_activa: false };
    expect(isLicenseValidOffline(inactiveTenantCache)).toBe(false);

    const inactiveUserCache: LocalLicenseCache = { ...validCache, tenant_users_activo: false };
    expect(isLicenseValidOffline(inactiveUserCache)).toBe(false);
  });

  it("resuelve updates de facturas como local_wins aunque el reloj servidor sea posterior", () => {
    const serverRowNewer = { id: "f1", updated_at: new Date().toISOString() };

    const entryUpdateOld: SyncOutboxEntry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "facturas",
      rowId: "f1",
      op: "update",
      payload: { updated_at: new Date(Date.now() - 10000).toISOString() },
      deviceId: "dev1",
    });
    const result1 = resolveConflictForTable("facturas", entryUpdateOld, serverRowNewer);
    expect(result1.resolution).toBe("local_wins");

    const entryUpdateNew = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "facturas",
      rowId: "f1",
      op: "update",
      payload: { updated_at: new Date().toISOString() },
      deviceId: "dev1",
    });
    const result2 = resolveConflictForTable("facturas", entryUpdateNew, serverRowNewer);
    expect(result2.resolution).toBe("local_wins");

    const entryDelete = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "facturas",
      rowId: "f1",
      op: "delete",
      deviceId: "dev1",
    });
    const result3 = resolveConflictForTable("facturas", entryDelete, serverRowNewer);
    expect(result3.resolution).toBe("local_wins");
    expect(result3.reason).toContain("administrativa");
  });

  it("ajusta payload de ciclo preservando id y cambiando solo cycle_number", () => {
    const payload = {
      id: "cierre-1",
      tenant_id: "tenant-1",
      cycle_number: 7,
      closed_at: "2026-01-01T00:00:00.000Z",
    };

    expect(buildCierrePayloadWithCycleNumber(payload, 8)).toEqual({
      ...payload,
      cycle_number: 8,
    });
  });

  it("ajusta payload de factura preservando id y reescribiendo NCF stale", () => {
    const payload = {
      id: "factura-1",
      tenant_id: "tenant-1",
      ncf_tipo: "B01",
      ncf: "B0100000007",
      total: 1200,
    };

    expect(buildNcfWithSequence("B0100000007", 8)).toBe("B0100000008");
    expect(buildFacturaPayloadWithNcfSequence(payload, 8)).toEqual({
      ...payload,
      ncf: "B0100000008",
    });
  });

  it("reserva NCF offline desde una secuencia local explícita y avanza el mirror", () => {
    const reservation = buildLocalTenantNcfReservation({
      ncf_fiscal_activo: true,
      ncf_tipo_default: "B02",
      ncf_b02_secuencia_siguiente: 141,
    });

    expect(reservation).toMatchObject({
      reserved: {
        ncf: "B0200000141",
        tipoCodigo: "B02",
        usedSequence: 141,
        sequenceReservedAtomically: true,
        reservationSource: "local_mirror",
      },
      nextTenantRow: {
        ncf_b02_secuencia_siguiente: 142,
        ncf_secuencia_siguiente: 142,
      },
    });
  });

  it("rechaza NCF offline si no hay secuencia local explícita", () => {
    const reservation = buildLocalTenantNcfReservation({
      ncf_fiscal_activo: true,
      ncf_tipo_default: "B01",
    });

    expect(reservation).toEqual({
      reason: "No hay una secuencia NCF local válida para garantizar unicidad fiscal.",
    });
  });

  it("cierres operativos no se duplican en servidor", () => {
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "cierres_operativos",
      rowId: "c1",
      op: "insert",
      payload: { cycle_number: 5 },
      deviceId: "dev1",
    });
    const existingCycle = { id: "c1", cycle_number: 5 };
    const result = resolveConflictForTable("cierres_operativos", entry, existingCycle);
    expect(result.resolution).toBe("server_wins");
    expect(result.reason).toContain("ya existe");
  });

  it("convierte estados fiscales offline a estados procesables antes de subir", () => {
    expect(buildEcfDocumentPayloadForServer({ id: "doc-1", status: "pending_offline" })).toEqual({
      payload: { id: "doc-1", status: "queued" },
      adjusted: true,
    });
    expect(buildFiscalOutboxPayloadForServer({ id: "job-1", status: "pending_sync" })).toEqual({
      payload: { id: "job-1", status: "queued" },
      adjusted: true,
    });
  });

  it("no duplica documentos e-CF ni outbox si ya existen en servidor", () => {
    const docEntry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "ecf_documents",
      rowId: "doc-1",
      op: "insert",
      deviceId: "dev1",
    });
    const jobEntry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "fiscal_outbox",
      rowId: "job-1",
      op: "insert",
      deviceId: "dev1",
    });

    expect(resolveConflictForTable("ecf_documents", docEntry, { id: "doc-1" }).resolution).toBe("server_wins");
    expect(resolveConflictForTable("fiscal_outbox", jobEntry, { id: "job-1" }).resolution).toBe("server_wins");
  });

  it("identidades siempre ganan del servidor", () => {
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "tenant_users",
      rowId: "u1",
      op: "update",
      payload: { activo: false },
      deviceId: "dev1",
    });
    const result = resolveConflictForTable("tenant_users", entry, { id: "u1" });
    expect(result.resolution).toBe("server_wins");
  });

  it("permite sincronizar configuración segura del tenant incluyendo fiscal y UI", () => {
    const safePayload = {
      cantidad_mesas: 24,
      ncf_secuencias_por_tipo: { B01: 5 },
      ncf_b01_secuencia_siguiente: 5,
      fiscal_mode: "traditional",
      updated_at: "2026-01-01T00:00:00.000Z"
    };

    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "tenants",
      rowId: "tenant-1",
      op: "update",
      payload: safePayload,
      deviceId: "dev1",
    });

    const result = resolveConflictForTable("tenants", entry, { id: "tenant-1", ncf_b01_secuencia_siguiente: 4, ncf_secuencias_por_tipo: { B01: 4 } });
    expect(result.resolution).toBe("local_wins");

    const guardrail = resolveOutboxConflictGuardrail("tenant-1", entry, { id: "tenant-1" });
    expect(guardrail.action).toBe("apply_local_write");
    expect(guardrail.shouldWriteServer).toBe(true);
  });

  it("invalidates only the local session context and preserves the tenant database", async () => {
    const originalStorage = globalThis.localStorage;
    const originalIndexedDb = globalThis.indexedDB;
    const sessionRows = new Set(["tenant-1"]);
    const stores = {
      tenants: new Map([["tenant-1", { id: "tenant-1", nombre_negocio: "Preserved" }]]),
      facturas: new Map([["sale-1", { id: "sale-1", total: 100 }]]),
      sync_outbox: new Map([["outbox-1", { id: "outbox-1", status: "pending" }]]),
      local_fiscal_outbox: new Map([["fiscal-1", { id: "fiscal-1", fiscal_status: "pending_sync" }]]),
      local_device_session: sessionRows,
    };
    let deleteDatabaseCalled = false;
    let openDatabaseCalled = false;

    globalThis.localStorage = {
      getItem: (key: string) => key === "cloudix_last_tenant_id" ? "tenant-1" : null,
      removeItem: () => undefined,
      setItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } as Storage;
    globalThis.indexedDB = {
      open: () => {
        openDatabaseCalled = true;
        const request: any = {};
        queueMicrotask(() => {
          const transaction: any = {
            objectStore: (name: string) => ({
              delete: (key: string) => (stores as any)[name]?.delete(key),
            }),
          };
          request.result = {
            transaction: () => {
              queueMicrotask(() => transaction.oncomplete?.());
              return transaction;
            },
            close: () => undefined,
          };
          request.onsuccess?.();
        });
        return request;
      },
      deleteDatabase: () => {
        deleteDatabaseCalled = true;
        throw new Error("destructive database deletion is not allowed for session invalidation");
      },
    } as unknown as IDBFactory;

    try {
      await invalidateLocalSessionContext("tenant-1");
      expect(sessionRows.has("tenant-1")).toBe(false);
      expect(stores.tenants.has("tenant-1")).toBe(true);
      expect(stores.facturas.has("sale-1")).toBe(true);
      expect(stores.sync_outbox.has("outbox-1")).toBe(true);
      expect(stores.local_fiscal_outbox.has("fiscal-1")).toBe(true);
      expect(openDatabaseCalled).toBe(true);
      expect(deleteDatabaseCalled).toBe(false);
    } finally {
      globalThis.localStorage = originalStorage;
      globalThis.indexedDB = originalIndexedDb;
    }
  });

  it("keeps Desktop on SQLite/localStorage without touching IndexedDB", async () => {
    const originalWindow = globalThis.window;
    const originalStorage = globalThis.localStorage;
    const originalIndexedDb = globalThis.indexedDB;
    const storage = new Map<string, string>();
    let openCalls = 0;
    let deleteCalls = 0;

    globalThis.window = { electronAPI: {} } as Window & typeof globalThis;
    globalThis.localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
      clear: () => storage.clear(),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() { return storage.size; },
    } as Storage;
    globalThis.indexedDB = {
      open: () => {
        openCalls += 1;
        throw new Error("Desktop must not open IndexedDB");
      },
      deleteDatabase: () => {
        deleteCalls += 1;
        throw new Error("Desktop must not delete IndexedDB");
      },
    } as unknown as IDBFactory;

    try {
      await saveLocalDeviceSession("tenant-1", "user-1", "user@example.com", { rol: "admin" });
      expect(await getLocalDeviceSession("tenant-1")).toMatchObject({ tenant_id: "tenant-1", user_id: "user-1" });

      const savedLicense = await saveLicenseCache("tenant-1", true, true);
      expect(await loadLicenseCache("tenant-1")).toEqual(savedLicense);

      await expect(readLocalMirror("tenant-1", "sucursales")).resolves.toEqual([]);
      await expect(readLocalOutbox("tenant-1")).resolves.toEqual([]);
      await expect(getLocalFirstStatusSnapshot("tenant-1")).resolves.toEqual({
        status: "history_complete",
        completedHistoryTables: 0,
        totalHistoryTables: 0,
      });
      await expect(bootstrapLocalFirstPhase({ tenantId: "tenant-1", phase: "minimum", tables: ["sucursales"] })).resolves.toBeUndefined();
      await expect(syncIncremental("tenant-1")).resolves.toEqual({ tablesUpdated: 0, rowsPulled: 0 });
      await expect(syncLanEdge("tenant-1")).resolves.toEqual({ applied: 0 });
      await expect(pushOutboxToServer("tenant-1")).resolves.toEqual({ pushed: 0, failed: 0 });
      await expect(writeLocalMirrorRow("tenant-1", "sucursales", { id: "branch-1" })).rejects.toThrow("SQLite persistence bridge");
      await expect(processInvoiceInventoryDeduction("tenant-1", { items: [{ plato_id: 1, cantidad: 1 }] }, "user-1", "device-1")).resolves.toBeUndefined();

      await deleteLocalTenantDatabase("tenant-1");
      expect(openCalls).toBe(0);
      expect(deleteCalls).toBe(0);
    } finally {
      if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
      else globalThis.window = originalWindow;
      globalThis.localStorage = originalStorage;
      globalThis.indexedDB = originalIndexedDb;
    }
  });

  it.each(["error", "blocked"] as const)("does not reopen Web IndexedDB when recovery deletion is %s", async (outcome) => {
    const originalWindow = globalThis.window;
    const originalIndexedDb = globalThis.indexedDB;
    let openCalls = 0;
    let deleteCalls = 0;

    globalThis.window = undefined as unknown as Window & typeof globalThis;
    globalThis.indexedDB = {
      open: () => {
        openCalls += 1;
        const request: any = {};
        queueMicrotask(() => {
          request.error = new DOMException("Internal error", "UnknownError");
          request.onerror?.();
        });
        return request;
      },
      deleteDatabase: () => {
        deleteCalls += 1;
        const request: any = {};
        queueMicrotask(() => {
          if (outcome === "blocked") request.onblocked?.();
          else {
            request.error = new DOMException("delete failed", "UnknownError");
            request.onerror?.();
          }
        });
        return request;
      },
    } as unknown as IDBFactory;

    try {
      await expect(saveLicenseCache(`tenant-recovery-${outcome}`, true, true)).rejects.toThrow();
      expect(openCalls).toBe(1);
      expect(deleteCalls).toBe(1);
    } finally {
      if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
      else globalThis.window = originalWindow;
      globalThis.indexedDB = originalIndexedDb;
    }
  });

  it("permite sincronizar el día de pago como configuración segura", () => {
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1", tableName: "tenants", rowId: "tenant-1", op: "update",
      payload: { payment_day_of_month: 31 }, deviceId: "dev1",
    });
    expect(resolveConflictForTable("tenants", entry, { id: "tenant-1" }).resolution).toBe("local_wins");
  });

  it("bloquea actualización fiscal si intentan retroceder una secuencia respecto al servidor", () => {
    const backwardPayload = {
      ncf_b01_secuencia_siguiente: 5,
      updated_at: "2026-01-01T00:00:00.000Z"
    };
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "tenants",
      rowId: "tenant-1",
      op: "update",
      payload: backwardPayload,
      deviceId: "dev1",
    });
    
    // server has sequence 10
    const result = resolveConflictForTable("tenants", entry, { id: "tenant-1", ncf_b01_secuencia_siguiente: 10 });
    expect(result.resolution).toBe("server_wins");
    expect(result.reason).toContain("no puede retroceder");
  });

  it("bloquea actualización fiscal por tipo si intentan retroceder una secuencia respecto al servidor", () => {
    const backwardPayload = {
      ncf_secuencias_por_tipo: { B01: 5 },
      updated_at: "2026-01-01T00:00:00.000Z"
    };
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "tenants",
      rowId: "tenant-1",
      op: "update",
      payload: backwardPayload,
      deviceId: "dev1",
    });
    
    // server has sequence 10 for B01
    const result = resolveConflictForTable("tenants", entry, { id: "tenant-1", ncf_secuencias_por_tipo: { B01: 10 } });
    expect(result.resolution).toBe("server_wins");
    expect(result.reason).toContain("no puede retroceder");
  });

  it("bloquea payloads que solo contienen updated_at", () => {
    const timeOnlyPayload = {
      updated_at: "2026-01-01T00:00:00.000Z"
    };
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "tenants",
      rowId: "tenant-1",
      op: "update",
      payload: timeOnlyPayload,
      deviceId: "dev1",
    });
    
    const result = resolveConflictForTable("tenants", entry, { id: "tenant-1" });
    expect(result.resolution).toBe("server_wins");
    expect(result.reason).toContain("solo timestamp");
  });

  it("bloquea payload con campos sensibles o identidades en el tenant", () => {
    const sensitivePayload = { plan: "pro", activa: false };
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "tenants",
      rowId: "tenant-1",
      op: "update",
      payload: sensitivePayload,
      deviceId: "dev1",
    });

    const result = resolveConflictForTable("tenants", entry, { id: "tenant-1" });
    expect(result.resolution).toBe("server_wins");
  });

  it("bloquea payload mixto que contiene al menos un campo sensible en el tenant", () => {
    const mixedPayload = { cantidad_mesas: 30, activa: false };
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "tenants",
      rowId: "tenant-1",
      op: "update",
      payload: mixedPayload,
      deviceId: "dev1",
    });

    const result = resolveConflictForTable("tenants", entry, { id: "tenant-1" });
    expect(result.resolution).toBe("server_wins");
  });

  it("bloquea payload que contiene el id del tenant", () => {
    const payloadWithId = { id: "tenant-1", cantidad_mesas: 30 };
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "tenants",
      rowId: "tenant-1",
      op: "update",
      payload: payloadWithId,
      deviceId: "dev1",
    });

    const result = resolveConflictForTable("tenants", entry, { id: "tenant-1" });
    expect(result.resolution).toBe("server_wins");
  });

  it("aplica guardrails de conflicto antes de mutar servidor", () => {
    const tenantUpdate = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "tenant_users",
      rowId: "u1",
      op: "update",
      payload: { activo: true },
      deviceId: "dev1",
    });

    const tenantGuardrail = resolveOutboxConflictGuardrail("tenant-1", tenantUpdate, { id: "u1" });
    expect(tenantGuardrail.action).toBe("mark_synced_server_wins");
    expect(tenantGuardrail.shouldWriteServer).toBe(false);

    const consumoInsert = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "consumos",
      rowId: "c-1",
      op: "insert",
      payload: { id: "c-1", total: 200 },
      deviceId: "dev1",
    });

    const consumoGuardrail = resolveOutboxConflictGuardrail("tenant-1", consumoInsert, null);
    expect(consumoGuardrail.action).toBe("apply_local_write");
    expect(consumoGuardrail.shouldWriteServer).toBe(true);
  });

  it("sincroniza el delete administrativo de facturas", () => {
    const facturaDelete = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "facturas",
      rowId: "f-1",
      op: "delete",
      deviceId: "dev1",
    });

    const guardrail = resolveOutboxConflictGuardrail("tenant-1", facturaDelete, { id: "f-1" });
    expect(guardrail.action).toBe("apply_local_write");
    expect(guardrail.shouldWriteServer).toBe(true);
    expect(guardrail.reason).toContain("factura");
  });

  it.each(["compras", "compra_detalles", "inventario_movimientos"] as const)(
    "marca como sincronizado el conflicto insert 409 de %s cuando ya existe el mismo id remoto",
    (tableName) => {
      const entry = createSyncOutboxEntry({
        tenantId: "tenant-1",
        tableName,
        rowId: `${tableName}-1`,
        op: "insert",
        payload: { id: `${tableName}-1` },
        deviceId: "device-1",
      });

      expect(resolvePurchaseOutboxInsertFailure(entry, "duplicate key value violates unique constraint", {
        foundById: true,
        foundByCompraId: false,
      })).toMatchObject({ disposition: "mark_synced" });
    }
  );

  it("marca compra_fiscal como sincronizada cuando existe el mismo id remoto", () => {
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "compra_fiscal",
      rowId: "fiscal-1",
      op: "insert",
      payload: { id: "fiscal-1", compra_id: "compra-1" },
      deviceId: "device-1",
    });

    expect(resolvePurchaseOutboxInsertFailure(entry, "409 conflict", {
      foundById: true,
      foundByCompraId: false,
    })).toMatchObject({ disposition: "mark_synced" });
  });

  it("acepta compra_fiscal existente por compra_id aunque su id remoto sea diferente", () => {
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "compra_fiscal",
      rowId: "local-fiscal-1",
      op: "insert",
      payload: { id: "local-fiscal-1", compra_id: "compra-1" },
      deviceId: "device-1",
    });

    expect(resolvePurchaseOutboxInsertFailure(entry, "duplicate key value", {
      foundById: false,
      foundByCompraId: true,
    })).toMatchObject({ disposition: "mark_synced" });
  });

  it("no confirma un insert con conflicto si la relectura no acusa una fila remota", () => {
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1", tableName: "compras", rowId: "compra-1", op: "insert", payload: { id: "compra-1" }, deviceId: "device-1",
    });

    expect(resolvePurchaseOutboxInsertFailure(entry, "409 conflict", {
      foundById: false,
      foundByCompraId: false,
    })).toMatchObject({ disposition: "retryable_failure", retryStatus: "retryable" });
  });

  it.each([
    "insert or update violates foreign key constraint",
    "new row violates check constraint",
    "validation failed for purchase detail",
  ])("deja una falla terminal auditable para conflicto FK o validación: %s", (message) => {
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "compras",
      rowId: "compra-1",
      op: "insert",
      payload: { id: "compra-1" },
      deviceId: "device-1",
    });

    expect(resolvePurchaseOutboxInsertFailure(entry, message, {
      foundById: false,
      foundByCompraId: false,
    })).toMatchObject({ disposition: "terminal_failure", retryStatus: "not_retryable" });
  });

  it("conserva como retryable una falla transitoria de compra desconocida", () => {
    const entry = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "compras",
      rowId: "compra-1",
      op: "insert",
      payload: { id: "compra-1" },
      deviceId: "device-1",
    });

    expect(resolvePurchaseOutboxInsertFailure(entry, "network timeout while contacting server", {
      foundById: false,
      foundByCompraId: false,
    })).toMatchObject({ disposition: "retryable_failure", retryStatus: "retryable" });
  });

  it("persiste metadata de error de sync con retry status", () => {
    const outbox = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "facturas",
      rowId: "f-1",
      op: "update",
      payload: { id: "f-1" },
      deviceId: "dev1",
    });

    const syncError = buildSyncErrorRow({
      outboxEntry: outbox,
      reason: "Version servidora mas reciente",
      retryStatus: "not_retryable",
      recoverable: true,
    });

    expect(syncError).toMatchObject({
      outbox_id: outbox.id,
      tenant_id: "tenant-1",
      table_name: "facturas",
      row_id: "f-1",
      op: "update",
      retry_status: "not_retryable",
      recoverable: true,
    });

    expect(syncError.id).toContain(`sync-error:terminal:${outbox.id}:not_retryable`);
  });

  it("procesa outbox por created_at asc con desempate estable por id", () => {
    const base: SyncOutboxEntry = {
      ...createSyncOutboxEntry({
        tenantId: "tenant-1",
        tableName: "consumos",
        rowId: "r-1",
        op: "insert",
        payload: { id: "r-1" },
        deviceId: "dev1",
      }),
      created_at: "2026-01-02T10:00:00.000Z",
      status: "pending",
    };

    const entries: SyncOutboxEntry[] = [
      { ...base, id: "b", created_at: "2026-01-02T10:00:00.000Z", status: "error" },
      { ...base, id: "a", created_at: "2026-01-02T10:00:00.000Z", status: "pending" },
      { ...base, id: "z", created_at: "2026-01-02T11:00:00.000Z", status: "pending" },
      { ...base, id: "old", created_at: "2026-01-02T09:00:00.000Z", status: "syncing" },
    ];

    const ordered = selectProcessableOutboxEntries(entries);
    expect(ordered.map((entry) => entry.id)).toEqual(["old", "a", "b", "z"]);
  });

  it("incluye syncing recuperable y excluye terminal not_retryable", () => {
    const mk = (id: string, status: SyncOutboxEntry["status"]): SyncOutboxEntry => ({
      ...createSyncOutboxEntry({
        tenantId: "tenant-1",
        tableName: "facturas",
        rowId: id,
        op: "update",
        payload: { id },
        deviceId: "dev1",
      }),
      id,
      created_at: "2026-01-01T00:00:00.000Z",
      status,
    });

    const entries: SyncOutboxEntry[] = [
      mk("pending", "pending"),
      mk("error", "error"),
      mk("syncing", "syncing"),
      mk("synced", "synced"),
      mk("terminal", "not_retryable"),
    ];

    const selected = selectProcessableOutboxEntries(entries);
    expect(selected.map((entry) => entry.id)).toEqual(["error", "pending", "syncing"]);
  });

  it.each(["insert", "update"] as const)("no programa hijos de compra en %s hasta que su cabecera esté confirmada", (op) => {
    const parent = {
      ...createSyncOutboxEntry({ tenantId: "tenant-1", tableName: "compras", rowId: "compra-1", op: "insert", payload: { id: "compra-1" }, deviceId: "dev1" }),
      id: "parent",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const child = {
      ...createSyncOutboxEntry({ tenantId: "tenant-1", tableName: "compra_fiscal", rowId: "fiscal-1", op, payload: op === "insert" ? { id: "fiscal-1", compra_id: "compra-1" } : { ncf: "B0100000001" }, deviceId: "dev1" }),
      id: "child",
      created_at: "2026-01-01T00:00:00.000Z",
      ...(op === "update" ? { compra_dependency_id: "compra-1" } : {}),
    };

    expect(selectProcessableOutboxEntries([parent, child]).map((entry) => entry.id)).toEqual(["parent"]);
    expect(selectProcessableOutboxEntries([{ ...parent, status: "synced" }, child]).map((entry) => entry.id)).toEqual(["child"]);
  });

  it("bloquea un update de cuentas_pagar hasta que su compra padre esté confirmada", () => {
    const parent = {
      ...createSyncOutboxEntry({ tenantId: "tenant-1", tableName: "compras", rowId: "compra-1", op: "insert", payload: { id: "compra-1" }, deviceId: "dev1" }),
      id: "parent",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const accountPayableUpdate = {
      ...createSyncOutboxEntry({ tenantId: "tenant-1", tableName: "cuentas_pagar", rowId: "cxp-1", op: "update", payload: { saldo_pendiente: 50 }, deviceId: "dev1" }),
      id: "cxp-update",
      created_at: "2026-01-01T00:00:00.000Z",
      compra_dependency_id: "compra-1",
    };

    expect(selectProcessableOutboxEntries([parent, accountPayableUpdate]).map((entry) => entry.id)).toEqual(["parent"]);
    expect(selectProcessableOutboxEntries([{ ...parent, status: "synced" }, accountPayableUpdate]).map((entry) => entry.id)).toEqual(["cxp-update"]);
  });

  it("no despacha el update de un consumo (estado pagado + factura_id) hasta que su factura esté confirmada", () => {
    // Reproduces the mesa-reopen bug: the consumo PATCH carrying factura_id must
    // not be sent before the invoice insert, or PostgreSQL rejects it (23503 → 409).
    const factura = {
      ...createSyncOutboxEntry({ tenantId: "tenant-1", tableName: "facturas", rowId: "factura-1", op: "insert", payload: { id: "factura-1" }, deviceId: "dev1" }),
      id: "factura",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const consumoPagado = {
      ...createSyncOutboxEntry({ tenantId: "tenant-1", tableName: "consumos", rowId: "consumo-1", op: "update", payload: { estado: "pagado", factura_id: "factura-1" }, deviceId: "dev1" }),
      id: "consumo",
      created_at: "2026-01-01T00:00:00.000Z",
    };

    // Even if the sort tiebreak would put the consumo first, it is deferred.
    expect(selectProcessableOutboxEntries([consumoPagado, factura]).map((entry) => entry.id)).toEqual(["factura"]);
    expect(selectProcessableOutboxEntries([{ ...factura, status: "synced" }, consumoPagado]).map((entry) => entry.id)).toEqual(["consumo"]);
    // A consumo whose factura is already in the cloud (not in the batch) is not blocked.
    expect(selectProcessableOutboxEntries([consumoPagado]).map((entry) => entry.id)).toEqual(["consumo"]);
  });

  it("deriva la dependencia de compra de la fila local para updates de fiscal y CxP", () => {
    for (const tableName of ["compra_fiscal", "cuentas_pagar"] as const) {
      const entry = createSyncOutboxEntry({
        tenantId: "tenant-1", tableName, rowId: `${tableName}-1`, op: "update", payload: { updated_at: "2026-01-01T00:00:00.000Z" }, deviceId: "dev1",
      });
      expect(resolveCompraDependencyId(entry, { id: entry.row_id, compra_id: "compra-1" })).toBe("compra-1");
    }
  });

  it.each([
    ["insert", [{ id: "compra-1" }], null],
    ["update", [{ id: "compra-1" }], null],
    ["insert", [], "servidor no confirmó"],
    ["update", [], "servidor no confirmó"],
  ] as const)("requiere acuse remoto para %s", (op, data, expectedFailure) => {
    const entry = createSyncOutboxEntry({ tenantId: "tenant-1", tableName: "compras", rowId: "compra-1", op, deviceId: "dev1" });
    const failure = getOutboxAcknowledgementFailure(entry, { data });
    if (expectedFailure) expect(failure).toContain(expectedFailure);
    else expect(failure).toBeNull();
  });

  it("aplica backoff sólo a fallos transitorios y corta tras el máximo", () => {
    expect(resolveSyncFailureRetry({ message: "Forbidden", status: 403 }, 0)).toMatchObject({
      retryStatus: "not_retryable",
      nextAttemptAt: null,
    });
    expect(resolveSyncFailureRetry({ message: "Gateway timeout", status: 504 }, 0)).toMatchObject({
      retryStatus: "retryable",
    });
    expect(resolveSyncFailureRetry({ message: "Gateway timeout", status: 504 }, 4)).toMatchObject({
      retryStatus: "max_retries_exceeded",
      nextAttemptAt: null,
    });
    expect(resolveSyncFailureRetry({ message: "sin acuse", code: "OUTBOX_NO_ACK" }, 0)).toMatchObject({
      retryStatus: "retryable",
    });
    expect(resolveSyncFailureRetry({ message: "conflicto sin fila confirmada", code: "OUTBOX_UNCONFIRMED_CONFLICT" }, 0)).toMatchObject({
      retryStatus: "retryable",
    });
    expect(resolveSyncFailureRetry({ message: "conflicto sin fila confirmada", code: "OUTBOX_UNCONFIRMED_CONFLICT" }, 4)).toMatchObject({
      retryStatus: "max_retries_exceeded",
      nextAttemptAt: null,
    });
  });

  it("respeta next_attempt_at antes de volver a procesar un error transitorio", () => {
    const entry = {
      ...createSyncOutboxEntry({ tenantId: "tenant-1", tableName: "compras", rowId: "compra-1", op: "insert", deviceId: "dev1" }),
      status: "error" as const,
      next_attempt_at: "2026-01-01T00:01:00.000Z",
    };
    expect(selectProcessableOutboxEntries([entry], Date.parse("2026-01-01T00:00:00.000Z"))).toEqual([]);
    expect(selectProcessableOutboxEntries([entry], Date.parse("2026-01-01T00:01:00.000Z")).map((item) => item.id)).toEqual([entry.id]);
  });

  it("normaliza sólo aperturas legacy de cierre y bloquea cierres incompletos sin descartarlos", () => {
    const openEntry = {
      ...createSyncOutboxEntry({
        tenantId: "tenant-1", tableName: "cierres_operativos", rowId: "cierre-1", op: "upsert",
        payload: { type: "orders.cycle.open", id: "cierre-1", businessDay: "2026-09-15", openingCash: 125 }, deviceId: "dev1",
      }),
      created_at: "2026-09-15T10:00:00.000Z",
    };
    expect(normalizeLegacyCierreOutboxEntry(openEntry)).toEqual({
      adjusted: true,
      payload: {
        id: "cierre-1", tenant_id: "tenant-1", business_day: "2026-09-15", cycle_number: 1,
        opened_at: "2026-09-15T10:00:00.000Z", closed_at: null, efectivo_inicial: 125,
      },
    });

    const closeEntry = { ...openEntry, payload: { type: "orders.cycle.close", id: "cierre-1" } };
    expect(normalizeLegacyCierreOutboxEntry(closeEntry)).toMatchObject({ retryStatus: "not_retryable" });
  });

  it("reintenta syncing stale pero no uno activo con lease reciente", () => {
    const now = new Date("2026-01-01T00:10:00.000Z").getTime();
    const mkSyncing = (id: string, syncingStartedAt: string | null): SyncOutboxEntry => ({
      ...createSyncOutboxEntry({
        tenantId: "tenant-1",
        tableName: "facturas",
        rowId: id,
        op: "update",
        payload: { id },
        deviceId: "dev1",
      }),
      id,
      created_at: "2026-01-01T00:00:00.000Z",
      status: "syncing",
      syncing_started_at: syncingStartedAt,
    });

    const selected = selectProcessableOutboxEntries([
      mkSyncing("active", "2026-01-01T00:09:30.000Z"),
      mkSyncing("stale", "2026-01-01T00:04:30.000Z"),
      mkSyncing("legacy", null),
    ], now);

    expect(selected.map((entry) => entry.id)).toEqual(["legacy", "stale"]);
  });

  it("resuelve modo desktop local-first online/offline", () => {
    const desktopOnline: LocalWriteMode = resolveLocalWriteMode({ isDesktop: true, isOnline: true });
    const desktopOffline: LocalWriteMode = resolveLocalWriteMode({ isDesktop: true, isOnline: false });

    expect(desktopOnline).toBe("desktop-local-first");
    expect(desktopOffline).toBe("desktop-local-first");
  });

  it("resuelve modo web server-first por defecto", () => {
    const webOnline: LocalWriteMode = resolveLocalWriteMode({ isDesktop: false, isOnline: true });
    const webOffline: LocalWriteMode = resolveLocalWriteMode({ isDesktop: false, isOnline: false });

    expect(webOnline).toBe("web-server-first");
    expect(webOffline).toBe("web-server-first");
  });

  it("permite write offline desktop con licencia válida en cache", async () => {
    const validCache: LocalLicenseCache = {
      tenant_id: "tenant-1",
      tenant_activa: true,
      tenant_users_activo: true,
      validated_at: new Date().toISOString(),
      window_valid_until: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    await expect(assertCanWriteOffline("tenant-1", validCache)).resolves.toEqual({ valid: true });
  });

  it("permite write offline con autorización activa aunque la fecha cache haya pasado", async () => {
    const expiredCache: LocalLicenseCache = {
      tenant_id: "tenant-1",
      tenant_activa: true,
      tenant_users_activo: true,
      validated_at: new Date().toISOString(),
      window_valid_until: new Date(Date.now() - 1000).toISOString(),
    };
    await expect(assertCanWriteOffline("tenant-1", expiredCache)).resolves.toEqual({ valid: true });
  });

  it("aplica upsert al mirror local fusionando fila existente", () => {
    const merged = buildLocalMirrorWriteResult({
      op: "upsert",
      rowId: "m-1",
      existing: { id: "m-1", tenant_id: "tenant-1", estado: "libre", deuda_pendiente: 0 },
      payload: { estado: "ocupada", deuda_pendiente: 120 },
    });

    expect(merged).toEqual({
      id: "m-1",
      tenant_id: "tenant-1",
      estado: "ocupada",
      deuda_pendiente: 120,
    });
  });

  it("crea fila base al upsert cuando no existe registro local", () => {
    const merged = buildLocalMirrorWriteResult({
      op: "upsert",
      rowId: "m-2",
      existing: undefined,
      payload: { tenant_id: "tenant-1", estado: "ocupada" },
    });

    expect(merged).toEqual({
      id: "m-2",
      tenant_id: "tenant-1",
      estado: "ocupada",
    });
  });

  it("usa conflicto compuesto solo para mesas_estado", () => {
    expect(resolveUpsertConflictTarget("mesas_estado")).toBe("tenant_id,id");
    expect(resolveUpsertConflictTarget("cocina_estado")).toBe("id");
    expect(resolveUpsertConflictTarget("consumos")).toBe("id");
  });

  it("mantiene guardrail de tenant_id en payload para tablas tenant-scoped", () => {
    expect(buildServerWritePayload("tenant-1", "cocina_estado", { id: "c1", activa: true })).toEqual({
      id: "c1",
      activa: true,
      tenant_id: "tenant-1",
    });

    expect(() =>
      buildServerWritePayload("tenant-1", "consumos", { id: "x1", tenant_id: "tenant-2", total: 50 })
    ).toThrow(/tenant_id/i);
  });

  it("no inyecta tenant_id en tabla tenants", () => {
    expect(buildServerWritePayload("tenant-1", "tenants", { id: "tenant-1", nombre: "Cyber Bistro" })).toEqual({
      id: "tenant-1",
      nombre: "Cyber Bistro",
    });
  });

  it("resuelve conflicto deduplicando insert de cxc_pagos y cxp_pagos si ya existen en servidor", () => {
    const entryCxc = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "cxc_pagos",
      rowId: "cxc-pago-1",
      op: "insert",
      payload: { id: "cxc-pago-1", monto: 500 },
      deviceId: "dev1",
    });

    const resultCxc = resolveConflictForTable("cxc_pagos", entryCxc, { id: "cxc-pago-1" });
    expect(resultCxc.resolution).toBe("server_wins");

    const entryCxp = createSyncOutboxEntry({
      tenantId: "tenant-1",
      tableName: "cxp_pagos",
      rowId: "cxp-pago-1",
      op: "insert",
      payload: { id: "cxp-pago-1", monto: 1200 },
      deviceId: "dev1",
    });

    const resultCxp = resolveConflictForTable("cxp_pagos", entryCxp, { id: "cxp-pago-1" });
    expect(resultCxp.resolution).toBe("server_wins");
  });

  it("rechaza escribir facturas en IndexedDB vía enqueueLocalWrite", async () => {
    await expect(
      enqueueLocalWrite({
        tenantId: "tenant-1",
        tableName: "facturas" as any,
        rowId: "f-1",
        op: "insert",
        payload: { id: "f-1" },
        deviceId: "dev-1",
      })
    ).rejects.toThrow("cannot be written to IndexedDB");
  });

  it("rechaza escribir comandas en IndexedDB vía enqueueLocalWrite", async () => {
    await expect(
      enqueueLocalWrite({
        tenantId: "tenant-1",
        tableName: "comandas" as any,
        rowId: "c-1",
        op: "insert",
        payload: { id: "c-1" },
        deviceId: "dev-1",
      })
    ).rejects.toThrow("cannot be written to IndexedDB");
  });

  it("rechaza escribir mesas_estado en IndexedDB vía enqueueLocalWrite", async () => {
    await expect(
      enqueueLocalWrite({
        tenantId: "tenant-1",
        tableName: "mesas_estado" as any,
        rowId: "m-1",
        op: "insert",
        payload: { id: "m-1" },
        deviceId: "dev-1",
      })
    ).rejects.toThrow("cannot be written to IndexedDB");
  });

  it("rechaza escribir consumos en IndexedDB vía enqueueLocalWrite", async () => {
    await expect(
      enqueueLocalWrite({
        tenantId: "tenant-1",
        tableName: "consumos" as any,
        rowId: "c-1",
        op: "insert",
        payload: { id: "c-1" },
        deviceId: "dev-1",
      })
    ).rejects.toThrow("cannot be written to IndexedDB");
  });

  it("rechaza encolar facturas, comandas, mesas o consumos en IndexedDB vía enqueueLocalWritesAtomically", async () => {
    await expect(
      enqueueLocalWritesAtomically([
        {
          tenantId: "tenant-1",
          tableName: "consumos" as any,
          rowId: "c-1",
          op: "insert",
          payload: { id: "c-1" },
          deviceId: "dev-1",
        },
      ])
    ).rejects.toThrow("cannot be enqueued in IndexedDB");
  });
});
