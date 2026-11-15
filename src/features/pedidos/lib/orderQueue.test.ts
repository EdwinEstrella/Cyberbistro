import { describe, expect, it } from "vitest";
import { sortOrdersForQueue } from "./orderQueue";

function order(id: string, status: string, orderType: string, createdAt: string) {
  return { id, status, order_type: orderType, created_at: createdAt };
}

const ids = (list: { id: string }[]) => list.map((o) => o.id);

describe("sortOrdersForQueue", () => {
  it("puts pending company orders before pending public orders even when the public one is older", () => {
    const sorted = sortOrdersForQueue([
      order("public-old", "pending", "takeout", "2026-11-14T10:00:00Z"),
      order("company-new", "pending", "company", "2026-11-14T12:00:00Z"),
    ]);
    expect(ids(sorted)).toEqual(["company-new", "public-old"]);
  });

  it("serves the oldest waiting order first inside each priority group", () => {
    const sorted = sortOrdersForQueue([
      order("c2", "pending", "company", "2026-11-14T12:00:00Z"),
      order("c1", "pending", "company", "2026-11-14T11:00:00Z"),
      order("p2", "pending", "in_store", "2026-11-14T09:30:00Z"),
      order("p1", "pending", "takeout", "2026-11-14T09:00:00Z"),
    ]);
    expect(ids(sorted)).toEqual(["c1", "c2", "p1", "p2"]);
  });

  it("lists handled orders after pending ones, newest first, with no company priority", () => {
    const sorted = sortOrdersForQueue([
      order("done-company-old", "accepted", "company", "2026-11-14T08:00:00Z"),
      order("done-public-new", "rejected", "takeout", "2026-11-14T11:00:00Z"),
      order("pending-public", "pending", "takeout", "2026-11-14T12:00:00Z"),
    ]);
    expect(ids(sorted)).toEqual(["pending-public", "done-public-new", "done-company-old"]);
  });

  it("does not mutate the input and keeps the original order for identical timestamps", () => {
    const input = [
      order("a", "pending", "takeout", "2026-11-14T10:00:00Z"),
      order("b", "pending", "takeout", "2026-11-14T10:00:00Z"),
    ];
    const snapshot = [...input];
    expect(ids(sortOrdersForQueue(input))).toEqual(["a", "b"]);
    expect(input).toEqual(snapshot);
  });

  it("tolerates an unparseable date without throwing", () => {
    const sorted = sortOrdersForQueue([
      order("bad", "pending", "takeout", "not-a-date"),
      order("good", "pending", "takeout", "2026-11-14T10:00:00Z"),
    ]);
    expect(ids(sorted)).toEqual(["bad", "good"]);
  });
});
