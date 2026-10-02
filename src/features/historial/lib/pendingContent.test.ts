import { describe, expect, it } from "vitest";
import { countPendingContent, parseTimestamp } from "./pendingContent";

describe("parseTimestamp", () => {
  it("treats Postgres, ISO and SQLite spellings of the same instant as equal", () => {
    const iso = parseTimestamp("2026-10-02T12:00:00.000Z");
    expect(parseTimestamp("2026-10-02 12:00:00+00")).toBe(iso);
    expect(parseTimestamp("2026-10-02 12:00:00.000000+00:00")).toBe(iso);
    expect(parseTimestamp("2026-10-02 12:00:00")).toBe(iso);
    expect(parseTimestamp("2026-10-02T08:00:00-04:00")).toBe(iso);
  });

  it("returns NaN for empty or invalid input", () => {
    expect(parseTimestamp(null)).toBeNaN();
    expect(parseTimestamp("not a date")).toBeNaN();
  });
});

describe("countPendingContent", () => {
  const local = [{ id: "a", updatedAt: "2026-10-02T12:00:00.000Z" }];

  it("counts cloud rows missing locally", () => {
    expect(countPendingContent([{ id: "b", updated_at: "2026-10-02 12:00:00+00" }], local)).toEqual({ missing: 1, stale: 0, total: 1 });
  });

  it("counts rows newer in the cloud", () => {
    expect(countPendingContent([{ id: "a", updated_at: "2026-10-02 12:00:01+00" }], local)).toEqual({ missing: 0, stale: 1, total: 1 });
  });

  it("ignores equal rows even when formats differ", () => {
    expect(countPendingContent([{ id: "a", updated_at: "2026-10-02 12:00:00+00" }], local).total).toBe(0);
  });

  it("ignores rows older in the cloud", () => {
    expect(countPendingContent([{ id: "a", updated_at: "2026-10-01 12:00:00+00" }], local).total).toBe(0);
  });

  it("treats an unknown local version as stale only when the cloud has a version", () => {
    const noVersion = [{ id: "a", updatedAt: null }];
    expect(countPendingContent([{ id: "a", updated_at: "2026-10-02 12:00:00+00" }], noVersion).stale).toBe(1);
    expect(countPendingContent([{ id: "a", updated_at: null }], noVersion).total).toBe(0);
  });
});
