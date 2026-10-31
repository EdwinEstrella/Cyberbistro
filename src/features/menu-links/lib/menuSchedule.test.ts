import { describe, expect, it } from "vitest";
import {
  isMonday,
  addDays,
  addWeeks,
  getMondayOfWeek,
  formatWeekRange,
  isWeekPast,
  validateWeekdays,
  validateMenuSchedule,
} from "./menuSchedule";

describe("menuSchedule", () => {
  it("correctly identifies Mondays", () => {
    expect(isMonday("2026-10-26")).toBe(true); // Monday
    expect(isMonday("2026-10-27")).toBe(false); // Tuesday
    expect(isMonday("2026-11-01")).toBe(false); // Sunday
    expect(isMonday("invalid")).toBe(false);
  });

  it("adds days and weeks correctly", () => {
    expect(addDays("2026-10-26", 6)).toBe("2026-11-01");
    expect(addWeeks("2026-10-26", 1)).toBe("2026-11-02");
    expect(addWeeks("2026-10-26", 2)).toBe("2026-11-09");
  });

  it("calculates Monday of week for any date", () => {
    // 2026-10-26 is Monday
    expect(getMondayOfWeek("2026-10-26")).toBe("2026-10-26");
    // 2026-10-28 is Wednesday -> Monday was 2026-10-26
    expect(getMondayOfWeek("2026-10-28")).toBe("2026-10-26");
    // 2026-11-01 is Sunday -> Monday was 2026-10-26
    expect(getMondayOfWeek("2026-11-01")).toBe("2026-10-26");
  });

  it("formats week range string properly", () => {
    expect(formatWeekRange("2026-10-26")).toBe("Semana del lun 26/10 al dom 01/11");
    expect(formatWeekRange("2026-11-02")).toBe("Semana del lun 02/11 al dom 08/11");
  });

  it("detects whether a weekly menu is in the past", () => {
    // Week of Oct 19 to Oct 25
    expect(isWeekPast("2026-10-19", "2026-10-31")).toBe(true);
    // Week of Oct 26 to Nov 01 (today is Oct 31)
    expect(isWeekPast("2026-10-26", "2026-10-31")).toBe(false);
    // Week of Nov 02 to Nov 08
    expect(isWeekPast("2026-11-02", "2026-10-31")).toBe(false);
  });

  it("validates weekdays array", () => {
    expect(validateWeekdays([1, 2, 3, 4, 5, 6, 7]).valid).toBe(true);
    expect(validateWeekdays([1, 3, 5]).valid).toBe(true);
    expect(validateWeekdays([]).valid).toBe(false);
    expect(validateWeekdays([1, 2, 8]).valid).toBe(false);
    expect(validateWeekdays([1, 1, 2]).valid).toBe(false);
  });

  it("validates menu schedule configuration", () => {
    expect(validateMenuSchedule({ schedule_mode: "recurring" }).valid).toBe(true);
    expect(validateMenuSchedule({ schedule_mode: "weekly" }).valid).toBe(false);
    expect(validateMenuSchedule({ schedule_mode: "weekly", week_start: "2026-10-27" }).valid).toBe(false); // Tuesday
    expect(validateMenuSchedule({ schedule_mode: "weekly", week_start: "2026-10-26" }).valid).toBe(true); // Monday
  });
});
