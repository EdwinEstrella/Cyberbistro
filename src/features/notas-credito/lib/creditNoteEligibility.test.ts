import { describe, expect, it } from "vitest";
import {
  CREDIT_NOTE_WINDOW_DAYS,
  buildCreditNoteRows,
  canManageCreditNotes,
  filterCreditNoteRows,
  getIneligibleReason,
  santoDomingoDay,
  santoDomingoDaysBetween,
  type CreditNoteInvoice,
} from "./creditNoteEligibility";

const NOW = new Date("2026-10-24T15:00:00.000Z"); // 11:00 in Santo Domingo (UTC-4)

function invoice(overrides: Partial<CreditNoteInvoice> = {}): CreditNoteInvoice {
  return {
    id: "f1",
    ncf: "E310000000001",
    estado: "pagada",
    credit_note_of: null,
    metodo_pago: "efectivo",
    created_at: "2026-10-20T15:00:00.000Z",
    total: 118,
    cliente_nombre: "Ana",
    ...overrides,
  };
}

describe("santoDomingoDay", () => {
  it("uses the Santo Domingo calendar day, not UTC", () => {
    expect(santoDomingoDay("2026-10-24T02:00:00.000Z")).toBe("2026-10-23");
    expect(santoDomingoDay("2026-10-24T04:00:00.000Z")).toBe("2026-10-24");
  });
  it("counts calendar days between two instants", () => {
    expect(santoDomingoDaysBetween("2026-09-24T03:59:00.000Z", NOW)).toBe(31);
    expect(santoDomingoDaysBetween("2026-09-24T04:00:00.000Z", NOW)).toBe(30);
  });
});

describe("getIneligibleReason", () => {
  const ctx = { ecfStatus: "accepted", creditedInvoiceIds: new Set<string>(), now: NOW };

  it("accepts an accepted E31 invoice inside the window", () => {
    expect(getIneligibleReason(invoice(), ctx)).toBeNull();
  });
  it("accepts E32", () => {
    expect(getIneligibleReason(invoice({ ncf: "E320000000001" }), ctx)).toBeNull();
  });
  it("rejects other e-CF types and non e-CF NCF", () => {
    expect(getIneligibleReason(invoice({ ncf: "E330000000001" }), ctx)).toBe("type");
    expect(getIneligibleReason(invoice({ ncf: "B0100000001" }), ctx)).toBe("type");
    expect(getIneligibleReason(invoice({ ncf: null }), ctx)).toBe("type");
  });
  it("rejects credit notes themselves", () => {
    expect(getIneligibleReason(invoice({ estado: "nota_credito" }), ctx)).toBe("is_credit_note");
    expect(getIneligibleReason(invoice({ credit_note_of: "f0" }), ctx)).toBe("is_credit_note");
  });
  it("rejects when the DGII has not accepted it", () => {
    expect(getIneligibleReason(invoice(), { ...ctx, ecfStatus: "submitted" })).toBe("not_accepted");
    expect(getIneligibleReason(invoice(), { ...ctx, ecfStatus: null })).toBe("not_accepted");
  });
  it("rejects when a credit note already exists", () => {
    expect(getIneligibleReason(invoice(), { ...ctx, creditedInvoiceIds: new Set(["f1"]) })).toBe("already_credited");
  });
  it("rejects fiado", () => {
    expect(getIneligibleReason(invoice({ metodo_pago: "Fiado" }), ctx)).toBe("credit_sale");
  });
  it("enforces the 30 day window in Santo Domingo days (boundary)", () => {
    expect(CREDIT_NOTE_WINDOW_DAYS).toBe(30);
    expect(getIneligibleReason(invoice({ created_at: "2026-09-24T04:00:00.000Z" }), ctx)).toBeNull();
    expect(getIneligibleReason(invoice({ created_at: "2026-09-24T03:59:00.000Z" }), ctx)).toBe("window_expired");
  });
});

describe("buildCreditNoteRows / filterCreditNoteRows", () => {
  const invoices = [
    invoice({ id: "a", ncf: "E310000000001", cliente_nombre: "Ana Perez" }),
    invoice({ id: "b", ncf: "E320000000002", cliente_nombre: "Luis" }),
    invoice({ id: "c", ncf: "E340000000003", estado: "nota_credito", credit_note_of: "a" }),
  ];
  const ecf = new Map([
    ["a", { status: "accepted" }],
    ["b", { status: "queued" }],
  ]);

  it("excludes credit notes and marks credited originals and unaccepted ones", () => {
    const { eligible, ineligible } = buildCreditNoteRows(invoices, ecf, NOW);
    expect(eligible).toHaveLength(0);
    expect(ineligible.map((r) => [r.invoice.id, r.reason])).toEqual([
      ["a", "already_credited"],
      ["b", "not_accepted"],
    ]);
  });
  it("lists the eligible ones when no note exists", () => {
    const { eligible } = buildCreditNoteRows([invoices[0]], ecf, NOW);
    expect(eligible.map((r) => r.invoice.id)).toEqual(["a"]);
  });
  it("searches by NCF and customer, case and accent insensitive", () => {
    const { eligible } = buildCreditNoteRows(
      [invoices[0], invoice({ id: "d", ncf: "E310000000009", cliente_nombre: "María" })],
      new Map([["a", { status: "accepted" }], ["d", { status: "accepted" }]]),
      NOW,
    );
    expect(filterCreditNoteRows(eligible, "0009").map((r) => r.invoice.id)).toEqual(["d"]);
    expect(filterCreditNoteRows(eligible, "maria").map((r) => r.invoice.id)).toEqual(["d"]);
    expect(filterCreditNoteRows(eligible, "  ")).toHaveLength(2);
  });
});

describe("canManageCreditNotes", () => {
  it("is admin only", () => {
    expect(canManageCreditNotes("admin")).toBe(true);
    expect(canManageCreditNotes("cajera")).toBe(false);
    expect(canManageCreditNotes("contabilidad")).toBe(false);
    expect(canManageCreditNotes(null)).toBe(false);
  });
});
