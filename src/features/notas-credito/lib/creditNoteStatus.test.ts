import { describe, expect, it } from "vitest";
import { getCreditNoteStatusDisplay } from "./creditNoteStatus";

describe("getCreditNoteStatusDisplay", () => {
  it.each([
    ["queued", "En cola"],
    ["signed", "En cola"],
    ["submitted", "Enviada"],
    ["accepted", "Aceptada"],
    ["rejected", "Rechazada"],
    ["terminal_error", "Error fiscal"],
    [null, "En cola"],
  ])("%s -> %s", (status, label) => {
    expect(getCreditNoteStatusDisplay(status as string | null).label).toBe(label);
  });
});
