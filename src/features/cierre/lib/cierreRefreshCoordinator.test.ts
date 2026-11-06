import { describe, expect, it, vi } from 'vitest';
import { createCierreLoadRunner } from './cierreRefreshCoordinator';

describe('createCierreLoadRunner', () => {
  it('shows full-screen loader on non-silent load and clears errors', async () => {
    const events: string[] = [];
    let loadingState = false;
    let errorState: string | null = 'previous error';

    const runner = createCierreLoadRunner({
      setLoading: (l) => {
        loadingState = l;
        events.push(`loading:${l}`);
      },
      setLoadError: (e) => {
        errorState = e;
        events.push(`error:${e}`);
      },
      fetchData: async () => {
        events.push('fetch');
        return [{ id: '1' }];
      },
      applyData: (_data) => {
        events.push('apply');
      },
    });

    await runner.run({ silent: false });

    expect(events).toEqual([
      'loading:true',
      'error:',
      'fetch',
      'apply',
      'loading:false',
    ]);
    expect(loadingState).toBe(false);
    expect(errorState).toBe('');
  });

  it('does NOT set loading or clear error during a silent refresh', async () => {
    const events: string[] = [];
    let loadingState = false;
    let errorState: string | null = 'existing error';

    const runner = createCierreLoadRunner({
      setLoading: (l) => {
        loadingState = l;
        events.push(`loading:${l}`);
      },
      setLoadError: (e) => {
        errorState = e;
        events.push(`error:${e}`);
      },
      fetchData: async () => {
        events.push('fetch');
        return [{ id: '1' }];
      },
      applyData: () => {
        events.push('apply');
      },
    });

    await runner.run({ silent: true });

    // Neither setLoading nor setLoadError should be called
    expect(events).toEqual(['fetch', 'apply']);
    expect(loadingState).toBe(false);
    expect(errorState).toBe('existing error');
  });

  it('keeps current data and logs error without blanking on silent refresh failure', async () => {
    const events: string[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let loadingState = false;
    let errorState: string | null = null;
    let currentData = [{ id: '1', total: 50 }];

    const runner = createCierreLoadRunner({
      setLoading: (l) => {
        loadingState = l;
        events.push(`loading:${l}`);
      },
      setLoadError: (e) => {
        errorState = e;
        events.push(`error:${e}`);
      },
      fetchData: async () => {
        events.push('fetch');
        throw new Error('Network timeout during pull');
      },
      applyData: (data) => {
        currentData = data;
        events.push('apply');
      },
    });

    await runner.run({ silent: true });

    expect(events).toEqual(['fetch']);
    expect(loadingState).toBe(false);
    expect(errorState).toBeNull();
    // Current data preserved
    expect(currentData).toEqual([{ id: '1', total: 50 }]);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Cierre] silent refresh failed:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
