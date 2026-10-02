import { describe, expect, it } from "vitest";
import { loadLastKnown, resolveWithLastKnownList, saveLastKnown } from "./lastKnownCache";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}
const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("lastKnownCache", () => {
  it("saves and loads a value", () => {
    const s = memoryStorage();
    saveLastKnown("ns", "t1", { a: 1 }, s);
    expect(loadLastKnown("ns", "t1", s)).toEqual({ a: 1 });
  });
  it("isolates tenants and namespaces", () => {
    const s = memoryStorage();
    saveLastKnown("ns", "t1", { a: 1 }, s);
    expect(loadLastKnown("ns", "t2", s)).toBeNull();
    expect(loadLastKnown("other", "t1", s)).toBeNull();
  });
  it("returns null on corrupted JSON", () => {
    const s = memoryStorage();
    s.setItem("cloudix_last_known:ns:t1", "{not json");
    expect(loadLastKnown("ns", "t1", s)).toBeNull();
  });
  it("never throws when storage throws or is unavailable", () => {
    expect(() => saveLastKnown("ns", "t1", 1, throwing)).not.toThrow();
    expect(loadLastKnown("ns", "t1", throwing)).toBeNull();
    expect(loadLastKnown("ns", "t1", null)).toBeNull();
  });
  it("resolveWithLastKnownList caches non-empty and falls back when empty", () => {
    const s = memoryStorage();
    expect(resolveWithLastKnownList("suc", "t1", [{ id: "a" }], s)).toEqual([{ id: "a" }]);
    expect(resolveWithLastKnownList("suc", "t1", [], s)).toEqual([{ id: "a" }]);
    expect(resolveWithLastKnownList("suc", "t2", [], s)).toEqual([]);
  });
  it("resolveWithLastKnownList ignores a non-array cached value", () => {
    const s = memoryStorage();
    saveLastKnown("suc", "t1", { not: "array" }, s);
    expect(resolveWithLastKnownList("suc", "t1", [], s)).toEqual([]);
  });
});
