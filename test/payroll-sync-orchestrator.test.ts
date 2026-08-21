import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { PayrollSyncOrchestrator } from '../electron/persistence/payrollSyncOrchestrator';

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
    
    // We expect the fakeClient to be invoked asynchronously
    // Wait for microtasks
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
    const originalEnv = process.env;
    process.env = {}; // Clear config
    
    // Should catch the error and not crash
    orchestrator.start(db, 'tenant-123'); // without fakeClient, it tries to init PayrollSyncClient
    
    expect(orchestrator.isRunning()).toBe(false);
    
    process.env = originalEnv;
  });

  it('triggers non-blocking sync successfully', async () => {
    const fakeClient = { push: vi.fn().mockResolvedValue({ result: {} }), pull: vi.fn() };
    orchestrator.start(db, 'tenant-123', fakeClient);
    
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, table_name, status, payload_json, operation) 
      VALUES ('out-1', 'tenant-123', 'payroll_employees', 'pending', '{"firstName": "John", "lastName": "Doe", "frequency": "monthly", "role": "cook", "baseSalaryCents": 1000, "isActive": true, "sucursalId": "br-1"}', 'upsert')
    `).run();

    await orchestrator.triggerSync();
    
    expect(fakeClient.push).toHaveBeenCalled();
  });
});