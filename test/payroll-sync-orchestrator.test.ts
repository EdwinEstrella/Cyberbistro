import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { PayrollSyncOrchestrator } from '../electron/persistence/payrollSyncOrchestrator';
import { TenantStore } from '../electron/persistence/tenantStore';

function insertPayrollOutboxRow(db: DatabaseSync, tenantId: string, id = 'out-1') {
  db.prepare(`
    INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tenantId,
    'branch-1',
    'payroll_employees',
    `${id}-row`,
    'upsert',
    JSON.stringify({
      sucursalId: 'branch-1',
      firstName: 'John',
      lastName: 'Doe',
      frequency: 'monthly',
      role: 'cook',
      baseSalaryCents: 1000,
      isActive: true,
    }),
    'pending',
  );
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('PayrollSyncOrchestrator Lifecycle', () => {
  let db: DatabaseSync;
  let orchestrator: PayrollSyncOrchestrator;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE sync_outbox (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        branch_id TEXT,
        table_name TEXT,
        row_id TEXT,
        operation TEXT,
        payload_json TEXT,
        error_json TEXT,
        status TEXT
      );
    `);
    orchestrator = new PayrollSyncOrchestrator();
    vi.useFakeTimers();
  });

  afterEach(() => {
    orchestrator.stop();
    db.close();
    vi.useRealTimers();
  });

  it('instantiates safely and schedules bounded interval', () => {
    const fakeClient = { push: vi.fn().mockResolvedValue({ result: {} }), pull: vi.fn() };
    orchestrator.start(db, 'tenant-123', fakeClient);
    
    expect(orchestrator.isRunning()).toBe(true);
    expect(fakeClient.push).not.toHaveBeenCalled();

    // Advance 30s
    vi.advanceTimersByTime(30000);
    // Since there are no pending rows, push won't be called directly, but triggerSync is fired
    // Let's insert a pending row so we know push was attempted
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, table_name, status, payload_json, operation) 
      VALUES ('out-1', 'tenant-123', 'payroll_employees', 'pending', '{}', 'upsert')
    `).run();

    vi.advanceTimersByTime(30000);
    
    expect(vi.getTimerCount()).toBe(1);
  });

  it('stops safely and prevents timer leaks', () => {
    const fakeClient = { push: vi.fn().mockResolvedValue({ result: {} }), pull: vi.fn() };
    orchestrator.start(db, 'tenant-123', fakeClient);
    
    expect(orchestrator.isRunning()).toBe(true);
    
    orchestrator.stop();
    expect(orchestrator.isRunning()).toBe(false);
    
    // Advance timers, should not crash or trigger
    vi.advanceTimersByTime(60000);
  });

  it('fails closed when missing config and does not crash app', () => {
    const originalUrl = process.env.VITE_INSFORGE_BASE_URL;
    const originalKey = process.env.VITE_INSFORGE_ANON_KEY;
    const originalDisable = process.env.DISABLE_INSFORGE_FALLBACK;
    process.env.DISABLE_INSFORGE_FALLBACK = 'true';
    delete process.env.VITE_INSFORGE_BASE_URL;
    delete process.env.INSFORGE_URL;
    delete process.env.VITE_INSFORGE_ANON_KEY;
    delete process.env.INSFORGE_ANON_KEY;
    
    // Should catch the error and not crash
    orchestrator.start(db, 'tenant-123'); // without fakeClient, it tries to init PayrollSyncClient
    
    expect(orchestrator.isRunning()).toBe(false);
    
    if (originalUrl !== undefined) process.env.VITE_INSFORGE_BASE_URL = originalUrl;
    if (originalKey !== undefined) process.env.VITE_INSFORGE_ANON_KEY = originalKey;
    if (originalDisable !== undefined) process.env.DISABLE_INSFORGE_FALLBACK = originalDisable;
    else delete process.env.DISABLE_INSFORGE_FALLBACK;
  });

  it('triggers non-blocking sync successfully', async () => {
    const fakeClient = { push: vi.fn().mockResolvedValue({ result: {} }), pull: vi.fn() };
    orchestrator.start(db, 'tenant-123', fakeClient);

    insertPayrollOutboxRow(db, 'tenant-123');

    await orchestrator.triggerSync();
    
    expect(fakeClient.push).toHaveBeenCalled();
  });

  it('requeues claimed rows, avoids late stale commits, and keeps timers bounded across tenant switch', async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), 'cloudix-payroll-sync-'));
    const deferredPush = createDeferred<{ result: Record<string, unknown> }>();
    const tenantA = TenantStore.open({ dataRoot, tenantId: 'tenant-a' });
    const tenantB = TenantStore.open({ dataRoot, tenantId: 'tenant-b' });
    const tenantADb = tenantA.getDatabase();
    const prepareSpy = vi.spyOn(tenantADb, 'prepare');
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };

    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const tenantAClient = {
        push: vi.fn().mockImplementation(() => deferredPush.promise),
        pull: vi.fn(),
      };
      const tenantBClient = { push: vi.fn().mockResolvedValue({ result: {} }), pull: vi.fn() };

      insertPayrollOutboxRow(tenantADb, 'tenant-a', 'tenant-a-outbox');
      orchestrator.start(tenantADb, 'tenant-a', tenantAClient);
      expect(vi.getTimerCount()).toBe(1);

      const inFlightSync = orchestrator.triggerSync();
      await Promise.resolve();

      expect(tenantAClient.push).toHaveBeenCalledTimes(1);
      expect((tenantADb.prepare("SELECT status FROM sync_outbox WHERE id = 'tenant-a-outbox'").get() as { status: string }).status).toBe('syncing');

      orchestrator.start(tenantB.getDatabase(), 'tenant-b', tenantBClient);
      expect(vi.getTimerCount()).toBe(1);
      expect((tenantADb.prepare("SELECT status FROM sync_outbox WHERE id = 'tenant-a-outbox'").get() as { status: string }).status).toBe('pending');

      tenantA.close();
      const prepareCallCountAfterClose = prepareSpy.mock.calls.length;

      deferredPush.resolve({ result: { synced: true } });
      await inFlightSync;
      await Promise.resolve();

      expect(unhandledRejections).toEqual([]);
      expect(prepareSpy.mock.calls.length).toBe(prepareCallCountAfterClose);
      expect(tenantBClient.push).not.toHaveBeenCalled();

      const reopenedTenantA = TenantStore.open({ dataRoot, tenantId: 'tenant-a' });
      try {
        expect(reopenedTenantA.readLocalOutbox()).toEqual([
          {
            id: 'tenant-a-outbox',
            tenantId: 'tenant-a',
            branchId: 'branch-1',
            tableName: 'payroll_employees',
            rowId: 'tenant-a-outbox-row',
            status: 'pending',
          },
        ]);
      } finally {
        reopenedTenantA.close();
      }

      orchestrator.stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
      tenantB.close();
      try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows may retain SQLite handles until process exit. */ }
    }
  });

  it('requeues claimed rows and ignores late completion after close', async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), 'cloudix-payroll-sync-close-'));
    const deferredPush = createDeferred<{ result: Record<string, unknown> }>();
    const tenantStore = TenantStore.open({ dataRoot, tenantId: 'tenant-a' });
    const db = tenantStore.getDatabase();
    const prepareSpy = vi.spyOn(db, 'prepare');
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };

    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const fakeClient = {
        push: vi.fn().mockImplementation(() => deferredPush.promise),
        pull: vi.fn(),
      };

      insertPayrollOutboxRow(db, 'tenant-a', 'tenant-a-close-outbox');
      orchestrator.start(db, 'tenant-a', fakeClient);

      const inFlightSync = orchestrator.triggerSync();
      await Promise.resolve();

      expect(fakeClient.push).toHaveBeenCalledTimes(1);
      orchestrator.stop();
      expect((db.prepare("SELECT status FROM sync_outbox WHERE id = 'tenant-a-close-outbox'").get() as { status: string }).status).toBe('pending');

      tenantStore.close();
      const prepareCallCountAfterClose = prepareSpy.mock.calls.length;

      deferredPush.resolve({ result: { synced: true } });
      await inFlightSync;
      await Promise.resolve();

      expect(unhandledRejections).toEqual([]);
      expect(prepareSpy.mock.calls.length).toBe(prepareCallCountAfterClose);

      const reopenedTenant = TenantStore.open({ dataRoot, tenantId: 'tenant-a' });
      try {
        expect(reopenedTenant.readLocalOutbox()).toEqual([
          {
            id: 'tenant-a-close-outbox',
            tenantId: 'tenant-a',
            branchId: 'branch-1',
            tableName: 'payroll_employees',
            rowId: 'tenant-a-close-outbox-row',
            status: 'pending',
          },
        ]);
      } finally {
        reopenedTenant.close();
      }
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
      try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows may retain SQLite handles until process exit. */ }
    }
  });
});
