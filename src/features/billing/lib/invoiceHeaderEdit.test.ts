import { describe, expect, it } from "vitest";
import { isNcfLocked, validateInvoiceHeaderEdit, type InvoiceHeaderInput } from "./invoiceHeaderEdit";

const original = {
  ncf: "B0200000001",
  ncf_tipo: "B02 - Factura de registro unico de ingresos",
  cliente_nombre: "Juan",
  cliente_rnc: null,
  notas: null,
  fiscal_mode: "ncf_legacy",
};

const same: InvoiceHeaderInput = { ncf: "B0200000001", cliente_nombre: "Juan", cliente_rnc: "", notas: "" };

describe("validateInvoiceHeaderEdit", () => {
  it("is a no-op when nothing changed (whitespace/empty normalized)", () => {
    const res = validateInvoiceHeaderEdit(original, { ...same, ncf: " b0200000001 ", cliente_nombre: "  Juan " });
    expect(res).toEqual({ ok: true, changed: false, changes: {} });
  });

  it("sends only changed fields", () => {
    const res = validateInvoiceHeaderEdit(original, { ...same, notas: "  hola " });
    expect(res).toEqual({ ok: true, changed: true, changes: { notas: "hola" } });
  });

  it("uppercases the NCF and derives ncf_tipo from its prefix", () => {
    const res = validateInvoiceHeaderEdit(original, { ...same, ncf: "b1500000044", cliente_rnc: "" });
    expect(res).toEqual({
      ok: true,
      changed: true,
      changes: { ncf: "B1500000044", ncf_tipo: "B15 - Factura de regimen especial" },
    });
  });

  it("clears ncf and ncf_tipo when the NCF is emptied", () => {
    const res = validateInvoiceHeaderEdit(original, { ...same, ncf: "  " });
    expect(res).toEqual({ ok: true, changed: true, changes: { ncf: null, ncf_tipo: null } });
  });

  it.each(["B02123", "X0200000001", "B0200000001X", "B9900000001", "B02ABCDEFGH"])("rejects invalid NCF %s", (ncf) => {
    const res = validateInvoiceHeaderEdit(original, { ...same, ncf });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.ncf).toMatch(/NCF inválido/);
  });

  it("requires the client RNC for B01", () => {
    const res = validateInvoiceHeaderEdit(original, { ...same, ncf: "B0100000005" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.cliente_rnc).toBeTruthy();

    const ok = validateInvoiceHeaderEdit(original, { ...same, ncf: "B0100000005", cliente_rnc: "131234567" });
    expect(ok).toMatchObject({ ok: true, changes: { ncf: "B0100000005", cliente_rnc: "131234567" } });
  });

  it("requires the RNC for E31 and when clearing the RNC of a B01 invoice", () => {
    const e31 = validateInvoiceHeaderEdit({ ...original, fiscal_mode: "ncf_legacy" }, { ...same, ncf: "E3100000001" });
    expect(e31.ok).toBe(false);

    const b01 = { ...original, ncf: "B0100000005", ncf_tipo: "B01", cliente_rnc: "131234567" };
    const cleared = validateInvoiceHeaderEdit(b01, { ncf: "B0100000005", cliente_nombre: "Juan", cliente_rnc: " ", notas: "" });
    expect(cleared.ok).toBe(false);
  });

  it("does not block unrelated edits on a legacy B01 invoice that has no RNC", () => {
    const b01 = { ...original, ncf: "B0100000005", ncf_tipo: "B01", cliente_rnc: null };
    const res = validateInvoiceHeaderEdit(b01, { ncf: "B0100000005", cliente_nombre: "Juan", cliente_rnc: "", notas: "nota" });
    expect(res).toMatchObject({ ok: true, changes: { notas: "nota" } });
  });

  it("does not require an RNC for B02", () => {
    expect(validateInvoiceHeaderEdit(original, { ...same, ncf: "B0200000009" })).toMatchObject({ ok: true, changed: true });
  });

  it("locks the NCF on e-CF invoices but keeps other fields editable", () => {
    const ecf = { ...original, fiscal_mode: "dgii_ecf", ncf: "E3200000001", ncf_tipo: "E32" };
    expect(isNcfLocked(ecf)).toBe(true);
    const blocked = validateInvoiceHeaderEdit(ecf, { ...same, ncf: "E3200000002" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.errors.ncf).toMatch(/e-CF/);

    const ok = validateInvoiceHeaderEdit(ecf, { ncf: "E3200000001", cliente_nombre: "Ana", cliente_rnc: "", notas: "" });
    expect(ok).toEqual({ ok: true, changed: true, changes: { cliente_nombre: "Ana" } });
  });

  it("never emits non-header fields", () => {
    const res = validateInvoiceHeaderEdit(original, { ncf: "B0200000009", cliente_nombre: "X", cliente_rnc: "1", notas: "n" });
    if (!res.ok) throw new Error("expected ok");
    expect(Object.keys(res.changes).sort()).toEqual(["cliente_nombre", "cliente_rnc", "ncf", "notas"]);
  });
});
