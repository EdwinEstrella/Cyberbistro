import { describe, expect, it } from "vitest";
import {
  rangeDays,
  weekdaysFromRange,
  deriveRangeFromWeekdays,
  clampRangeToWeek,
  shiftRangeToWeek,
  formatMenuRangeSummary,
  applyWeekdaysToIncluded,
  createDefaultDishDraft,
} from "./menuRange";
import type { MenuDishDraft } from "./types";

describe("menuRange", () => {
  // Fixed reference dates: Monday 2026-11-09 to Sunday 2026-11-15
  const MONDAY = "2026-11-09";
  const TUESDAY = "2026-11-10";
  const WEDNESDAY = "2026-11-11";
  const THURSDAY = "2026-11-12";
  const FRIDAY = "2026-11-13";
  const SATURDAY = "2026-11-14";
  const SUNDAY = "2026-11-15";

  describe("rangeDays", () => {
    it("returns inclusive count of calendar days", () => {
      expect(rangeDays(MONDAY, FRIDAY)).toBe(5);
      expect(rangeDays(MONDAY, SUNDAY)).toBe(7);
      expect(rangeDays(TUESDAY, THURSDAY)).toBe(3);
    });

    it("returns 1 for single-day range", () => {
      expect(rangeDays(MONDAY, MONDAY)).toBe(1);
      expect(rangeDays(FRIDAY, FRIDAY)).toBe(1);
    });

    it("returns 0 for invalid date strings", () => {
      expect(rangeDays("invalid", FRIDAY)).toBe(0);
      expect(rangeDays(MONDAY, "not-a-date")).toBe(0);
      expect(rangeDays("", "")).toBe(0);
      expect(rangeDays("2026/11/09", FRIDAY)).toBe(0);
    });

    it("returns 0 when hasta < desde (reversed)", () => {
      expect(rangeDays(FRIDAY, MONDAY)).toBe(0);
      expect(rangeDays(THURSDAY, TUESDAY)).toBe(0);
    });
  });

  describe("weekdaysFromRange", () => {
    it("returns [1..5] for Monday through Friday", () => {
      expect(weekdaysFromRange(MONDAY, FRIDAY)).toEqual([1, 2, 3, 4, 5]);
    });

    it("returns single day array for single-day range", () => {
      expect(weekdaysFromRange(WEDNESDAY, WEDNESDAY)).toEqual([3]);
      expect(weekdaysFromRange(MONDAY, MONDAY)).toEqual([1]);
      expect(weekdaysFromRange(SUNDAY, SUNDAY)).toEqual([7]);
    });

    it("returns full week [1..7] for invalid inputs", () => {
      expect(weekdaysFromRange("", FRIDAY)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(weekdaysFromRange(MONDAY, "bad")).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(weekdaysFromRange("foo", "bar")).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("returns [startDow] if startDow > endDow in same week", () => {
      expect(weekdaysFromRange(FRIDAY, TUESDAY)).toEqual([5]);
    });
  });

  describe("deriveRangeFromWeekdays", () => {
    it("derives min and max weekday across dishes", () => {
      const dishWeekdays = [
        [1, 2],
        [2, 3, 4],
      ];
      const range = deriveRangeFromWeekdays(MONDAY, dishWeekdays);
      expect(range.desde).toBe(MONDAY);
      expect(range.hasta).toBe(THURSDAY);
    });

    it("falls back to Monday..Sunday when dishes list is empty", () => {
      const range = deriveRangeFromWeekdays(MONDAY, []);
      expect(range.desde).toBe(MONDAY);
      expect(range.hasta).toBe(SUNDAY);
    });

    it("ignores invalid weekday numbers (outside 1..7, NaN, floats)", () => {
      const dishWeekdays = [
        [0, 8, NaN, -1, 3],
        [5, 99],
      ];
      const range = deriveRangeFromWeekdays(MONDAY, dishWeekdays);
      expect(range.desde).toBe(WEDNESDAY); // 3
      expect(range.hasta).toBe(FRIDAY); // 5
    });

    it("never mutates input arrays", () => {
      const innerA = Object.freeze([2, 4]);
      const innerB = Object.freeze([3, 5]);
      const outer = Object.freeze([innerA, innerB]) as unknown as number[][];

      const range = deriveRangeFromWeekdays(MONDAY, outer);
      expect(range.desde).toBe(TUESDAY); // 2
      expect(range.hasta).toBe(FRIDAY); // 5
      expect(outer).toEqual([[2, 4], [3, 5]]);
    });
  });

  describe("clampRangeToWeek", () => {
    it("clamps desde before Monday to Monday", () => {
      const SundayPrior = "2026-11-08";
      const clamped = clampRangeToWeek(MONDAY, SundayPrior, FRIDAY);
      expect(clamped.desde).toBe(MONDAY);
      expect(clamped.hasta).toBe(FRIDAY);
    });

    it("clamps hasta after Sunday to Sunday", () => {
      const MondayNext = "2026-11-16";
      const clamped = clampRangeToWeek(MONDAY, TUESDAY, MondayNext);
      expect(clamped.desde).toBe(TUESDAY);
      expect(clamped.hasta).toBe(SUNDAY);
    });

    it("clamps hasta < desde to desde", () => {
      const clamped = clampRangeToWeek(MONDAY, THURSDAY, TUESDAY);
      expect(clamped.desde).toBe(THURSDAY);
      expect(clamped.hasta).toBe(THURSDAY);
    });
  });

  describe("shiftRangeToWeek", () => {
    it("keeps hasta when selecting a new desde in the same week", () => {
      const shifted = shiftRangeToWeek(MONDAY, FRIDAY, TUESDAY);
      expect(shifted.weekStart).toBe(MONDAY);
      expect(shifted.desde).toBe(TUESDAY);
      expect(shifted.hasta).toBe(FRIDAY);
    });

    it("shifts hasta by weekday offset when moving to another week", () => {
      // Move from week 2026-11-09 (Fri offset = day 5) to next week starting Mon 2026-11-16
      const nextTuesday = "2026-11-17";
      const shifted = shiftRangeToWeek(MONDAY, FRIDAY, nextTuesday);
      expect(shifted.weekStart).toBe("2026-11-16");
      expect(shifted.desde).toBe(nextTuesday); // 2026-11-17
      expect(shifted.hasta).toBe("2026-11-20"); // Friday of that week
    });

    it("clamps shifted hasta to desde if candidate hasta < desde", () => {
      // old range: Mon..Tue (offset day 2)
      // new desde: Thursday (offset day 4) in another week
      const nextThursday = "2026-11-19";
      const shifted = shiftRangeToWeek(MONDAY, TUESDAY, nextThursday);
      expect(shifted.weekStart).toBe("2026-11-16");
      expect(shifted.desde).toBe(nextThursday);
      expect(shifted.hasta).toBe(nextThursday);
    });

    it("clamps shifted hasta to Sunday if candidate is beyond Sunday", () => {
      // old range: Mon..Sun
      const nextWednesday = "2026-11-18";
      const shifted = shiftRangeToWeek(MONDAY, SUNDAY, nextWednesday);
      expect(shifted.weekStart).toBe("2026-11-16");
      expect(shifted.desde).toBe(nextWednesday);
      expect(shifted.hasta).toBe("2026-11-22"); // Sunday
    });
  });

  describe("formatMenuRangeSummary", () => {
    it("formats multi-day range correctly in Spanish", () => {
      expect(formatMenuRangeSummary(MONDAY, FRIDAY)).toBe("Lun 09/11 al vie 13/11 · 5 días");
      expect(formatMenuRangeSummary(MONDAY, SUNDAY)).toBe("Lun 09/11 al dom 15/11 · 7 días");
      expect(formatMenuRangeSummary(TUESDAY, WEDNESDAY)).toBe("Mar 10/11 al mié 11/11 · 2 días");
    });

    it("formats single-day range correctly", () => {
      expect(formatMenuRangeSummary(MONDAY, MONDAY)).toBe("Lun 09/11 · 1 día");
      expect(formatMenuRangeSummary(SATURDAY, SATURDAY)).toBe("Sáb 14/11 · 1 día");
    });

    it("returns empty string for invalid dates", () => {
      expect(formatMenuRangeSummary("invalid", FRIDAY)).toBe("");
      expect(formatMenuRangeSummary(MONDAY, "")).toBe("");
    });
  });

  describe("TDD Step 4: applyWeekdaysToIncluded and createDefaultDishDraft", () => {
    it("createDefaultDishDraft produces draft with provided weekdays", () => {
      // Bug in step 4: newly included dishes must receive the active range weekdays, not [1..7]
      const rangeWeekdays = [1, 2, 3, 4, 5];
      const draft = createDefaultDishDraft(rangeWeekdays);
      expect(draft).toEqual({
        included: false,
        weekdays: [1, 2, 3, 4, 5],
        sort_order: 0,
        display_name: "",
      });
    });

    it("createDefaultDishDraft defaults to [1..7] when no weekdays specified", () => {
      const draft = createDefaultDishDraft();
      expect(draft).toEqual({
        included: false,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        sort_order: 0,
        display_name: "",
      });
    });

    it("applyWeekdaysToIncluded only updates included dishes and leaves unincluded dishes untouched", () => {
      const initialMap = new Map<number, MenuDishDraft>([
        [
          101,
          {
            included: true,
            weekdays: [1, 2, 3, 4, 5, 6, 7],
            sort_order: 1,
            display_name: "Sopa",
          },
        ],
        [
          102,
          {
            included: false,
            weekdays: [1, 2, 3, 4, 5, 6, 7],
            sort_order: 2,
            display_name: "Postre",
          },
        ],
      ]);

      const updatedMap = applyWeekdaysToIncluded(initialMap, [1, 2, 3]);

      // Returns a new Map
      expect(updatedMap).not.toBe(initialMap);

      // Only included dish updated
      expect(updatedMap.get(101)?.weekdays).toEqual([1, 2, 3]);
      expect(updatedMap.get(102)?.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);

      // Input untouched
      expect(initialMap.get(101)?.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });
  });
});
