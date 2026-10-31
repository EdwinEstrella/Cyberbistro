import { describe, expect, it } from "vitest";
import { computeMenuItemsDiff } from "./menuItemsDiff";
import type { MenuItem } from "./types";

describe("menuItemsDiff", () => {
  const existing: MenuItem[] = [
    {
      id: "item-1",
      tenant_id: "t1",
      menu_id: "m1",
      plato_id: 10,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      sort_order: 1,
      display_name: null,
    },
    {
      id: "item-2",
      tenant_id: "t1",
      menu_id: "m1",
      plato_id: 20,
      weekdays: [1, 2, 3],
      sort_order: 2,
      display_name: "Original 20",
    },
  ];

  it("detects no changes when draft matches existing items", () => {
    const draft = [
      { plato_id: 10, weekdays: [1, 2, 3, 4, 5, 6, 7], sort_order: 1, display_name: null },
      { plato_id: 20, weekdays: [3, 2, 1], sort_order: 2, display_name: "Original 20" },
    ];

    const diff = computeMenuItemsDiff(existing, draft);
    expect(diff.toInsert).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toDelete).toHaveLength(0);
  });

  it("detects new items to insert", () => {
    const draft = [
      { plato_id: 10, weekdays: [1, 2, 3, 4, 5, 6, 7], sort_order: 1, display_name: null },
      { plato_id: 20, weekdays: [1, 2, 3], sort_order: 2, display_name: "Original 20" },
      { plato_id: 30, weekdays: [1, 5], sort_order: 3, display_name: "Nuevo plato" },
    ];

    const diff = computeMenuItemsDiff(existing, draft);
    expect(diff.toInsert).toEqual([
      { plato_id: 30, weekdays: [1, 5], sort_order: 3, display_name: "Nuevo plato" },
    ]);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toDelete).toHaveLength(0);
  });

  it("detects updates to weekdays, sort_order, or display_name", () => {
    const draft = [
      { plato_id: 10, weekdays: [1, 2], sort_order: 5, display_name: "Plato 10 Renombrado" },
      { plato_id: 20, weekdays: [1, 2, 3], sort_order: 2, display_name: "Original 20" },
    ];

    const diff = computeMenuItemsDiff(existing, draft);
    expect(diff.toInsert).toHaveLength(0);
    expect(diff.toUpdate).toEqual([
      {
        id: "item-1",
        plato_id: 10,
        weekdays: [1, 2],
        sort_order: 5,
        display_name: "Plato 10 Renombrado",
      },
    ]);
    expect(diff.toDelete).toHaveLength(0);
  });

  it("detects items to delete", () => {
    const draft = [
      { plato_id: 10, weekdays: [1, 2, 3, 4, 5, 6, 7], sort_order: 1, display_name: null },
    ];

    const diff = computeMenuItemsDiff(existing, draft);
    expect(diff.toInsert).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toDelete).toEqual([{ id: "item-2", plato_id: 20 }]);
  });
});
