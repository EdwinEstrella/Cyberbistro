import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLinkSessionId, getLinkSessionId } from "./session";

describe("session helpers", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
      length: 0,
      key: vi.fn(() => null),
    } as unknown as Storage;

    (globalThis as unknown as { localStorage: Storage }).localStorage = storageMock;
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    vi.restoreAllMocks();
  });

  it("stores and retrieves a session ID from localStorage", () => {
    const token = "tok-123";
    const sid1 = getLinkSessionId(token);
    expect(sid1).toBeTruthy();
    expect(globalThis.localStorage.getItem("cb_link_session_tok-123")).toBe(sid1);

    const sid2 = getLinkSessionId(token);
    expect(sid2).toBe(sid1);

    clearLinkSessionId(token);
    expect(globalThis.localStorage.getItem("cb_link_session_tok-123")).toBeNull();
  });

  it("falls back to in-memory session if localStorage throws", () => {
    const token = "tok-fallback";
    vi.spyOn(globalThis.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: localStorage is disabled");
    });
    vi.spyOn(globalThis.localStorage, "setItem").mockImplementation(() => {
      throw new Error("SecurityError: localStorage is disabled");
    });

    const sid1 = getLinkSessionId(token);
    expect(sid1).toBeTruthy();

    const sid2 = getLinkSessionId(token);
    expect(sid2).toBe(sid1);
  });
});
