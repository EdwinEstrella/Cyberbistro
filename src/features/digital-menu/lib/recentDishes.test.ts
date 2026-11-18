import { describe, expect, it } from "vitest";
import type { PublicMenuItem } from "../components/PublicMenuOrderScreen";
import {
  MAX_RECENT_DISHES,
  formatOrderedWhen,
  loadRecentDishes,
  mergeRecentDishes,
  parseRecentDishes,
  recordRecentOrder,
  resolveRecentDishes,
} from "./recentDishes";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
}

function dish(platoId: number, name: string, price = 100): PublicMenuItem {
  return {
    id: `item-${platoId}`,
    plato_id: platoId,
    name,
    description: null,
    image_url: null,
    price,
    category: "Platos Fuertes",
    sort_order: 0,
  };
}

describe("parseRecentDishes", () => {
  it("returns an empty list for missing, malformed or non-array data", () => {
    expect(parseRecentDishes(null)).toEqual([]);
    expect(parseRecentDishes("not json")).toEqual([]);
    expect(parseRecentDishes('{"platoId":1}')).toEqual([]);
  });

  it("keeps only well-formed entries, including negative plato ids", () => {
    const raw = JSON.stringify([
      { platoId: 5, orderedAt: "2026-11-17T15:00:00.000Z" },
      { platoId: -1000000007, orderedAt: "2026-11-16T15:00:00.000Z" },
      { platoId: "6", orderedAt: "2026-11-16T15:00:00.000Z" },
      { platoId: 7, orderedAt: "not a date" },
      null,
    ]);
    expect(parseRecentDishes(raw)).toEqual([
      { platoId: 5, orderedAt: "2026-11-17T15:00:00.000Z" },
      { platoId: -1000000007, orderedAt: "2026-11-16T15:00:00.000Z" },
    ]);
  });
});

describe("mergeRecentDishes", () => {
  const older = [
    { platoId: 1, orderedAt: "2026-11-10T12:00:00.000Z" },
    { platoId: 2, orderedAt: "2026-11-09T12:00:00.000Z" },
  ];

  it("puts the new order first and moves repeated dishes to the front", () => {
    expect(mergeRecentDishes(older, [2, 3], "2026-11-18T12:00:00.000Z")).toEqual([
      { platoId: 2, orderedAt: "2026-11-18T12:00:00.000Z" },
      { platoId: 3, orderedAt: "2026-11-18T12:00:00.000Z" },
      { platoId: 1, orderedAt: "2026-11-10T12:00:00.000Z" },
    ]);
  });

  it("deduplicates ids within the same order", () => {
    expect(mergeRecentDishes([], [4, 4], "2026-11-18T12:00:00.000Z")).toEqual([
      { platoId: 4, orderedAt: "2026-11-18T12:00:00.000Z" },
    ]);
  });

  it(`keeps at most ${MAX_RECENT_DISHES} dishes`, () => {
    const ids = Array.from({ length: MAX_RECENT_DISHES + 5 }, (_, i) => i + 1);
    expect(mergeRecentDishes(older, ids, "2026-11-18T12:00:00.000Z")).toHaveLength(MAX_RECENT_DISHES);
  });
});

describe("recordRecentOrder / loadRecentDishes", () => {
  it("persists per menu slug and reads it back", () => {
    const storage = memoryStorage();
    recordRecentOrder("milenio", [10, 11], new Date("2026-11-18T12:00:00.000Z"), storage);
    recordRecentOrder("otro", [99], new Date("2026-11-18T12:00:00.000Z"), storage);

    expect(loadRecentDishes("milenio", storage).map((entry) => entry.platoId)).toEqual([10, 11]);
    expect(loadRecentDishes("otro", storage).map((entry) => entry.platoId)).toEqual([99]);
  });

  it("still returns the updated list when storage throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(recordRecentOrder("milenio", [10], new Date("2026-11-18T12:00:00.000Z"), broken)).toEqual([
      { platoId: 10, orderedAt: "2026-11-18T12:00:00.000Z" },
    ]);
    expect(loadRecentDishes("milenio", broken)).toEqual([]);
  });

  it("returns nothing without a slug or storage", () => {
    expect(loadRecentDishes("", memoryStorage())).toEqual([]);
    expect(loadRecentDishes("milenio", null)).toEqual([]);
  });
});

describe("resolveRecentDishes", () => {
  it("uses the current menu item and skips dishes no longer on the menu", () => {
    const items = [dish(1, "Locrio de pollo", 250), dish(2, "Chofán mixto", 260)];
    const recent = [
      { platoId: 2, orderedAt: "2026-11-18T12:00:00.000Z" },
      { platoId: 99, orderedAt: "2026-11-17T12:00:00.000Z" },
      { platoId: 1, orderedAt: "2026-11-16T12:00:00.000Z" },
    ];
    expect(resolveRecentDishes(recent, items)).toEqual([
      { item: items[1], orderedAt: "2026-11-18T12:00:00.000Z" },
      { item: items[0], orderedAt: "2026-11-16T12:00:00.000Z" },
    ]);
  });
});

describe("formatOrderedWhen", () => {
  const now = new Date(2026, 10, 18, 15, 0); // Wednesday 18 Nov 2026, local time

  it("labels today and yesterday by calendar day, not by 24h windows", () => {
    expect(formatOrderedWhen(new Date(2026, 10, 18, 8, 0), now)).toBe("Hoy");
    expect(formatOrderedWhen(new Date(2026, 10, 17, 23, 30), now)).toBe("Ayer");
  });

  it("uses the weekday within the last week", () => {
    expect(formatOrderedWhen(new Date(2026, 10, 16, 12, 0), now)).toBe("Lunes");
    expect(formatOrderedWhen(new Date(2026, 10, 12, 12, 0), now)).toBe("Jueves");
  });

  it("uses weeks and then a month fallback for older orders", () => {
    expect(formatOrderedWhen(new Date(2026, 10, 11, 12, 0), now)).toBe("Hace 1 sem.");
    expect(formatOrderedWhen(new Date(2026, 9, 28, 12, 0), now)).toBe("Hace 3 sem.");
    expect(formatOrderedWhen(new Date(2026, 9, 1, 12, 0), now)).toBe("Hace más de un mes");
  });

  it("treats a future date (clock skew) as today", () => {
    expect(formatOrderedWhen(new Date(2026, 10, 19, 12, 0), now)).toBe("Hoy");
  });
});
