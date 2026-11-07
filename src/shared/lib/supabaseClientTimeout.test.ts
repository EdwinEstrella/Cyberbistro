import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { isDesktopCloudUnavailable } from "./cloudAvailability";
import { supabaseFetchWithTimeout } from "./supabase";

vi.mock("./cloudAvailability", () => ({
  isDesktopCloudUnavailable: vi.fn().mockResolvedValue(false),
  registerCloudAnonKey: vi.fn(),
  registerCloudBaseUrl: vi.fn(),
}));

describe("supabase client timeout and retry behavior", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    originalFetch = globalThis.fetch;
    vi.mocked(isDesktopCloudUnavailable).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("resolves query with status 0 error including 'timed out' and calls fetch exactly once on timeout", async () => {
    const fetchStub = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        if (init?.signal?.aborted) {
          reject(init.signal.reason);
          return;
        }
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason);
        });
      });
    });
    globalThis.fetch = fetchStub;

    const client = createClient("https://example.supabase.co", "anon-key", {
      global: { fetch: supabaseFetchWithTimeout },
    });

    const queryPromise = client.from("platos").select("id").then((res) => res);

    // Advance past read timeout (6s) and flush
    await vi.advanceTimersByTimeAsync(6_000);
    // Advance further to verify postgrest-js does not attempt retries
    await vi.advanceTimersByTimeAsync(30_000);

    const result = await queryPromise;

    expect(result.status).toBe(0);
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toContain("timed out");
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("retries when rejection is named TimeoutError rather than AbortError", async () => {
    const fetchStub = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    globalThis.fetch = fetchStub;

    const client = createClient("https://example.supabase.co", "anon-key", {
      global: { fetch: supabaseFetchWithTimeout },
    });

    const queryPromise = client.from("platos").select("id").then((res) => res);

    // Advance timers so postgrest-js retry backoffs (1s, 2s, 4s) can complete
    await vi.advanceTimersByTimeAsync(10_000);

    const result = await queryPromise;

    expect(result.status).toBe(0);
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toContain("TimeoutError");
    // Plain TimeoutError is retried by postgrest-js fetchWithRetry, proving why
    // SupabaseRequestTimeoutError must use name = "AbortError" to prevent retry loops.
    expect(fetchStub.mock.calls.length).toBeGreaterThan(1);
    expect(fetchStub).toHaveBeenCalledTimes(4);
  });
});
