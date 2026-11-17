import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MenuRangePicker } from "./MenuRangePicker";
import type { DatePickerProps } from "../../../shared/ui/date-picker";

let capturedHastaProps: DatePickerProps | null = null;
let capturedDesdeProps: DatePickerProps | null = null;

vi.mock("../../../shared/ui/date-picker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/ui/date-picker")>();
  return {
    ...actual,
    DatePicker: (props: DatePickerProps) => {
      if (props["aria-label"] === "Hasta") {
        capturedHastaProps = props;
      } else if (props["aria-label"] === "Desde") {
        capturedDesdeProps = props;
      }
      return <div data-testid={`mock-datepicker-${props["aria-label"]}`}>{props.value}</div>;
    },
  };
});

describe("MenuRangePicker", () => {
  const MONDAY = "2026-11-09";
  const TUESDAY = "2026-11-10";
  const FRIDAY = "2026-11-13";

  beforeEach(() => {
    capturedHastaProps = null;
    capturedDesdeProps = null;
  });

  it("renders 'Desde' and 'Hasta' labels and the formatted summary text", () => {
    const onDesdeChange = vi.fn();
    const onHastaChange = vi.fn();

    const html = renderToStaticMarkup(
      <MenuRangePicker
        weekStart={MONDAY}
        desde={MONDAY}
        hasta={FRIDAY}
        onDesdeChange={onDesdeChange}
        onHastaChange={onHastaChange}
      />
    );

    expect(html).toContain("Desde");
    expect(html).toContain("Hasta");
    expect(html).toContain("Lun 09/11 al vie 13/11 · 5 días");
  });

  it("disables days outside [desde, Sunday] in the Hasta calendar", () => {
    const onDesdeChange = vi.fn();
    const onHastaChange = vi.fn();

    renderToStaticMarkup(
      <MenuRangePicker
        weekStart={MONDAY}
        desde={TUESDAY} // Tuesday 2026-11-10
        hasta={FRIDAY}
        onDesdeChange={onDesdeChange}
        onHastaChange={onHastaChange}
      />
    );

    expect(capturedHastaProps).not.toBeNull();
    const disabledDays = capturedHastaProps!.disabledDays;
    expect(typeof disabledDays).toBe("function");

    // Days before desde (Tuesday 2026-11-10) should be disabled
    expect(disabledDays!(new Date(2026, 10, 8, 12, 0, 0))).toBe(true); // Sunday 2026-11-08
    expect(disabledDays!(new Date(2026, 10, 9, 12, 0, 0))).toBe(true); // Monday 2026-11-09

    // Days within [desde, sunday] should be enabled (not disabled)
    expect(disabledDays!(new Date(2026, 10, 10, 12, 0, 0))).toBe(false); // Tuesday 2026-11-10 (desde)
    expect(disabledDays!(new Date(2026, 10, 12, 12, 0, 0))).toBe(false); // Thursday 2026-11-12
    expect(disabledDays!(new Date(2026, 10, 13, 12, 0, 0))).toBe(false); // Friday 2026-11-13
    expect(disabledDays!(new Date(2026, 10, 15, 12, 0, 0))).toBe(false); // Sunday 2026-11-15 (sunday)

    // Days after Sunday of the week should be disabled
    expect(disabledDays!(new Date(2026, 10, 16, 12, 0, 0))).toBe(true); // Next Monday 2026-11-16
    expect(disabledDays!(new Date(2026, 10, 20, 12, 0, 0))).toBe(true);
  });

  it("selecting a Hasta day calls onHastaChange with yyyy-MM-dd", () => {
    const onDesdeChange = vi.fn();
    const onHastaChange = vi.fn();

    renderToStaticMarkup(
      <MenuRangePicker
        weekStart={MONDAY}
        desde={MONDAY}
        hasta={FRIDAY}
        onDesdeChange={onDesdeChange}
        onHastaChange={onHastaChange}
      />
    );

    expect(capturedHastaProps).not.toBeNull();
    capturedHastaProps!.onChange!("2026-11-14");

    expect(onHastaChange).toHaveBeenCalledTimes(1);
    expect(onHastaChange).toHaveBeenCalledWith("2026-11-14");
  });

  it("selecting a Desde day calls onDesdeChange with yyyy-MM-dd", () => {
    const onDesdeChange = vi.fn();
    const onHastaChange = vi.fn();

    renderToStaticMarkup(
      <MenuRangePicker
        weekStart={MONDAY}
        desde={MONDAY}
        hasta={FRIDAY}
        onDesdeChange={onDesdeChange}
        onHastaChange={onHastaChange}
      />
    );

    expect(capturedDesdeProps).not.toBeNull();
    capturedDesdeProps!.onChange!("2026-11-10");

    expect(onDesdeChange).toHaveBeenCalledTimes(1);
    expect(onDesdeChange).toHaveBeenCalledWith("2026-11-10");
  });
});
