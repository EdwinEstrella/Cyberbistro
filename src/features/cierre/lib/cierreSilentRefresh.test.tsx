import { describe, expect, it } from 'vitest';
import { isTableRelevantForCierre } from './cierreSyncFilter';

describe('Cierre silent refresh behavior', () => {
  it('does not display the full-screen loader during a silent refresh', async () => {
    // Model state transitions for Cierre loading lifecycle
    let loading = true;
    let authLoading = false;
    let renderedLoaderCount = 0;
    let renderedContentCount = 0;

    const render = () => {
      if (authLoading || loading) {
        renderedLoaderCount++;
        return 'Cargando cierre...';
      }
      renderedContentCount++;
      return 'Cierre de Caja Content';
    };

    // Initial mount: loading is true
    expect(render()).toBe('Cargando cierre...');
    expect(renderedLoaderCount).toBe(1);

    // Initial load finishes
    loading = false;
    expect(render()).toBe('Cierre de Caja Content');
    expect(renderedContentCount).toBe(1);

    // Simulate silent refresh runner
    const silentCargar = async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent) {
        loading = true;
      }
      // Simulate network / SQLite fetch delay
      await new Promise((r) => setTimeout(r, 10));
      if (!silent) {
        loading = false;
      }
    };

    // Trigger silent refresh
    const refreshPromise = silentCargar({ silent: true });

    // Mid-flight: render should STILL be content, NOT loader!
    expect(render()).toBe('Cierre de Caja Content');
    expect(renderedLoaderCount).toBe(1); // unchanged!

    await refreshPromise;

    // After finish: still content, loader was never shown
    expect(render()).toBe('Cierre de Caja Content');
    expect(renderedLoaderCount).toBe(1);
    expect(loading).toBe(false);
  });

  it('filters out non-relevant table events and only triggers silent refresh for relevant tables', () => {
    const refreshCalls: Array<{ silent?: boolean }> = [];
    const triggerRefresh = (opts?: { silent?: boolean }) => {
      refreshCalls.push(opts ?? {});
    };

    const handleLocalDataUpdated = (payload: { tenantId?: string; tables?: string[] } | string, currentTenantId: string) => {
      const updatedTenantId = typeof payload === 'string' ? payload : payload?.tenantId;
      const tables = typeof payload === 'string' ? undefined : payload?.tables;

      if (!updatedTenantId || updatedTenantId === currentTenantId) {
        if (isTableRelevantForCierre(tables)) {
          triggerRefresh({ silent: true });
        }
      }
    };

    // 1. Irrelevant table: payroll_employees
    handleLocalDataUpdated({ tenantId: 'tenant-1', tables: ['payroll_employees'] }, 'tenant-1');
    expect(refreshCalls).toHaveLength(0);

    // 2. Irrelevant table: customers
    handleLocalDataUpdated({ tenantId: 'tenant-1', tables: ['customers'] }, 'tenant-1');
    expect(refreshCalls).toHaveLength(0);

    // 3. Relevant table: facturas
    handleLocalDataUpdated({ tenantId: 'tenant-1', tables: ['facturas'] }, 'tenant-1');
    expect(refreshCalls).toEqual([{ silent: true }]);

    // 4. Missing/empty tables (safe fallback)
    handleLocalDataUpdated({ tenantId: 'tenant-1', tables: [] }, 'tenant-1');
    expect(refreshCalls).toEqual([{ silent: true }, { silent: true }]);

    // 5. Legacy string payload
    handleLocalDataUpdated('tenant-1', 'tenant-1');
    expect(refreshCalls).toEqual([{ silent: true }, { silent: true }, { silent: true }]);

    // 6. Tenant mismatch -> ignored
    handleLocalDataUpdated({ tenantId: 'other-tenant', tables: ['facturas'] }, 'tenant-1');
    expect(refreshCalls).toHaveLength(3);
  });
});
