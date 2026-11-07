import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SUPABASE_AUTH_TIMEOUT_MS,
  SUPABASE_READ_TIMEOUT_MS,
  SUPABASE_WRITE_TIMEOUT_MS,
  SupabaseRequestTimeoutError,
  isSupabaseRequestTimeoutError,
  resolveSupabaseRequestTimeoutMs,
} from "./supabaseRequestTimeout";
import { formatSupabaseConnectivityError, supabaseFetchWithTimeout } from "./supabase";

function createPendingFetchStub() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_, reject) => {
      if (init?.signal?.aborted) {
        reject(init.signal.reason ?? new DOMException("Aborted", "AbortError"));
        return;
      }
      init?.signal?.addEventListener("abort", () => {
        reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError"));
      });
    });
  });
}

describe("resolveSupabaseRequestTimeoutMs", () => {
  it("resolves auth endpoints to 20s for both GET and POST", () => {
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/auth/v1/user", "GET")).toBe(
      SUPABASE_AUTH_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/auth/v1/token", "POST")).toBe(
      SUPABASE_AUTH_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("/auth/v1/settings", "GET")).toBe(
      SUPABASE_AUTH_TIMEOUT_MS
    );
  });

  it("resolves GET, HEAD, and undefined methods to 6s read timeout", () => {
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", "GET")).toBe(
      SUPABASE_READ_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", "HEAD")).toBe(
      SUPABASE_READ_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", undefined)).toBe(
      SUPABASE_READ_TIMEOUT_MS
    );
  });

  it("resolves mutation methods and rpc POST to 20s write timeout", () => {
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", "POST")).toBe(
      SUPABASE_WRITE_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", "PATCH")).toBe(
      SUPABASE_WRITE_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", "PUT")).toBe(
      SUPABASE_WRITE_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", "DELETE")).toBe(
      SUPABASE_WRITE_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/rpc/my_procedure", "POST")).toBe(
      SUPABASE_WRITE_TIMEOUT_MS
    );
  });

  it("handles lower-case methods correctly", () => {
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", "get")).toBe(
      SUPABASE_READ_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", "head")).toBe(
      SUPABASE_READ_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", "post")).toBe(
      SUPABASE_WRITE_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", "patch")).toBe(
      SUPABASE_WRITE_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", "put")).toBe(
      SUPABASE_WRITE_TIMEOUT_MS
    );
    expect(resolveSupabaseRequestTimeoutMs("https://example.supabase.co/rest/v1/items", "delete")).toBe(
      SUPABASE_WRITE_TIMEOUT_MS
    );
  });
});

describe("SupabaseRequestTimeoutError and type guard", () => {
  it("creates error with name AbortError and code SUPABASE_REQUEST_TIMEOUT", () => {
    const error = new SupabaseRequestTimeoutError(6000);
    expect(error.name).toBe("AbortError");
    expect(error.code).toBe("SUPABASE_REQUEST_TIMEOUT");
    expect(error.timeoutMs).toBe(6000);
    expect(error.message).toBe("Supabase request timed out after 6000 ms");
    expect(isSupabaseRequestTimeoutError(error)).toBe(true);
  });

  it("type guard validates error objects by code property", () => {
    expect(isSupabaseRequestTimeoutError({ code: "SUPABASE_REQUEST_TIMEOUT" })).toBe(true);
    expect(isSupabaseRequestTimeoutError(new Error("generic"))).toBe(false);
    expect(isSupabaseRequestTimeoutError(null)).toBe(false);
    expect(isSupabaseRequestTimeoutError(undefined)).toBe(false);
  });
});

describe("supabaseFetchWithTimeout behavior", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("GET rejects with SupabaseRequestTimeoutError at 6s (not before)", async () => {
    globalThis.fetch = createPendingFetchStub();

    let rejectedError: unknown = null;
    let settled = false;

    const promise = supabaseFetchWithTimeout("https://example.supabase.co/rest/v1/items", { method: "GET" })
      .catch((err) => {
        settled = true;
        rejectedError = err;
      });

    // At 5,999 ms, should still be pending
    await vi.advanceTimersByTimeAsync(5_999);
    expect(settled).toBe(false);
    expect(rejectedError).toBeNull();

    // At 6,000 ms, should reject with SupabaseRequestTimeoutError
    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(settled).toBe(true);
    expect(isSupabaseRequestTimeoutError(rejectedError)).toBe(true);
    expect((rejectedError as Error).name).toBe("AbortError");
    expect((rejectedError as any).code).toBe("SUPABASE_REQUEST_TIMEOUT");
    expect((rejectedError as any).timeoutMs).toBe(6000);
    expect((rejectedError as Error).message).toBe("Supabase request timed out after 6000 ms");
  });

  it("auth request is still pending at 6s and rejects at 20s", async () => {
    globalThis.fetch = createPendingFetchStub();

    let rejectedError: unknown = null;
    let settled = false;

    const promise = supabaseFetchWithTimeout("https://example.supabase.co/auth/v1/token", { method: "POST" })
      .catch((err) => {
        settled = true;
        rejectedError = err;
      });

    // At 6s, still pending
    await vi.advanceTimersByTimeAsync(6_000);
    expect(settled).toBe(false);
    expect(rejectedError).toBeNull();

    // At 19,999 ms, still pending
    await vi.advanceTimersByTimeAsync(13_999);
    expect(settled).toBe(false);
    expect(rejectedError).toBeNull();

    // At 20,000 ms, rejects
    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(settled).toBe(true);
    expect(isSupabaseRequestTimeoutError(rejectedError)).toBe(true);
    expect((rejectedError as any).timeoutMs).toBe(20000);
  });

  it("a caller abort rejects with the caller's error, not a timeout error", async () => {
    globalThis.fetch = createPendingFetchStub();

    const callerController = new AbortController();
    const callerReason = new Error("Custom caller abort");

    let rejectedError: unknown = null;
    const promise = supabaseFetchWithTimeout("https://example.supabase.co/rest/v1/items", {
      method: "GET",
      signal: callerController.signal,
    }).catch((err) => {
      rejectedError = err;
    });

    await vi.advanceTimersByTimeAsync(10);
    callerController.abort(callerReason);

    await promise;
    expect(rejectedError).toBe(callerReason);
    expect(isSupabaseRequestTimeoutError(rejectedError)).toBe(false);
  });

  it("an already-aborted caller signal is passed straight through without a timer", async () => {
    const callerReason = new Error("Pre-aborted signal");
    const callerController = new AbortController();
    callerController.abort(callerReason);

    const fetchStub = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => {
      return Promise.reject(callerReason);
    });
    globalThis.fetch = fetchStub;

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    setTimeoutSpy.mockClear();

    const promise = supabaseFetchWithTimeout("https://example.supabase.co/rest/v1/items", {
      method: "GET",
      signal: callerController.signal,
    });

    await expect(promise).rejects.toThrow(callerReason);
    expect(fetchStub).toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it("after a request settles the caller-signal listener has been removed (on timeout)", async () => {
    globalThis.fetch = createPendingFetchStub();

    const callerController = new AbortController();
    const removeSpy = vi.spyOn(callerController.signal, "removeEventListener");

    let rejected = false;
    const promise = supabaseFetchWithTimeout("https://example.supabase.co/rest/v1/items", {
      method: "GET",
      signal: callerController.signal,
    }).catch(() => {
      rejected = true;
    });

    await vi.advanceTimersByTimeAsync(6000);
    await promise;

    expect(rejected).toBe(true);
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("after a request settles the caller-signal listener has been removed (on success)", async () => {
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => {
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const callerController = new AbortController();
    const removeSpy = vi.spyOn(callerController.signal, "removeEventListener");

    const res = await supabaseFetchWithTimeout("https://example.supabase.co/rest/v1/items", {
      method: "GET",
      signal: callerController.signal,
    });

    expect(res.status).toBe(200);
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});

describe("formatSupabaseConnectivityError", () => {
  const EXPECTED_MSG =
    "No se pudo conectar con Supabase. Comprobá tu conexión a internet o el estado del backend.";

  it("formats SupabaseRequestTimeoutError", () => {
    const error = new SupabaseRequestTimeoutError(6000);
    expect(formatSupabaseConnectivityError(error)).toBe(EXPECTED_MSG);
  });

  it("formats AbortError and TimeoutError instances", () => {
    const abortErr = new DOMException("Operation aborted", "AbortError");
    expect(formatSupabaseConnectivityError(abortErr)).toBe(EXPECTED_MSG);

    const timeoutErr = new DOMException("Operation timed out", "TimeoutError");
    expect(formatSupabaseConnectivityError(timeoutErr)).toBe(EXPECTED_MSG);

    const customAbort = { name: "AbortError", message: "aborted" };
    expect(formatSupabaseConnectivityError(customAbort)).toBe(EXPECTED_MSG);
  });

  it("formats 'signal is aborted without reason' raw message", () => {
    const error = new Error("signal is aborted without reason");
    expect(formatSupabaseConnectivityError(error)).toBe(EXPECTED_MSG);

    const objError = { message: "signal is aborted without reason" };
    expect(formatSupabaseConnectivityError(objError)).toBe(EXPECTED_MSG);
  });

  it("formats existing 'Failed to fetch' error", () => {
    const error = new TypeError("Failed to fetch");
    expect(formatSupabaseConnectivityError(error)).toBe(EXPECTED_MSG);
  });

  it("returns null for non-connectivity errors", () => {
    expect(formatSupabaseConnectivityError(new Error("Invalid login credentials"))).toBeNull();
    expect(formatSupabaseConnectivityError(new Error("Email already registered"))).toBeNull();
    expect(formatSupabaseConnectivityError({ message: "Invalid password" })).toBeNull();
    expect(formatSupabaseConnectivityError(null)).toBeNull();
    expect(formatSupabaseConnectivityError(undefined)).toBeNull();
    expect(formatSupabaseConnectivityError("Random text")).toBeNull();
  });
});
