import { describe, it, expect, vi } from 'vitest';
import { createDedupedRefetch } from './dedupRefetch';

describe('dedupRefetch', () => {
  it('coalesces multiple concurrent calls into a single in-flight promise', async () => {
    let callCount = 0;
    let resolveFn: (val: string) => void = () => {};

    const fn = vi.fn().mockImplementation(() => {
      callCount++;
      return new Promise<string>((resolve) => {
        resolveFn = resolve;
      });
    });

    const deduped = createDedupedRefetch(fn);

    // Call 3 times simultaneously (e.g. online, focus, realtime subscribed all firing together)
    const p1 = deduped();
    const p2 = deduped();
    const p3 = deduped();

    expect(callCount).toBe(1);

    resolveFn('fresh-data');
    const results = await Promise.all([p1, p2, p3]);

    expect(callCount).toBe(1);
    expect(results).toEqual(['fresh-data', 'fresh-data', 'fresh-data']);

    // Subsequent call after in-flight completes runs a new fetch
    const p4 = deduped();
    expect(callCount).toBe(2);
    resolveFn('subsequent-data');
    await p4;
    expect(callCount).toBe(2);
  });

  it('clears in-flight state even if the refetch throws an error', async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Network error');
      return 'success';
    });

    const deduped = createDedupedRefetch(fn);

    await expect(deduped()).rejects.toThrow('Network error');

    // Should be able to try again and not be permanently locked
    const result = await deduped();
    expect(result).toBe('success');
    expect(callCount).toBe(2);
  });
});
