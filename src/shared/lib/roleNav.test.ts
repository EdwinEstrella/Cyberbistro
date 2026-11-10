import { describe, expect, it } from "vitest";
import {
  canDeleteInvoices,
  canEditInvoiceHeader,
  canViewBillingSummaries,
  isAppRouteAllowed,
} from "./roleNav";

describe("invoice permissions by role", () => {
  it("only admin can delete invoices", () => {
    expect(canDeleteInvoices("admin")).toBe(true);
    for (const rol of ["cajera", "ventas", "vendedor", "cajero", "contabilidad", "mesero", "cocina", null]) {
      expect(canDeleteInvoices(rol)).toBe(false);
    }
  });

  it("admin and sales roles can edit the invoice header", () => {
    for (const rol of ["admin", "cajera", "ventas", "vendedor", "vender", "cajero"]) {
      expect(canEditInvoiceHeader(rol)).toBe(true);
    }
  });

  it("sales roles see only invoices, not cycles/finance summaries", () => {
    for (const rol of ["cajera", "ventas", "vendedor", "cajero"]) {
      expect(canViewBillingSummaries(rol)).toBe(false);
    }
    for (const rol of ["admin", "contabilidad"]) {
      expect(canViewBillingSummaries(rol)).toBe(true);
    }
  });

  it("gates Formato 607 export visibility: false for cajera, true for admin and contabilidad", () => {
    expect(canViewBillingSummaries("cajera")).toBe(false);
    expect(canViewBillingSummaries("admin")).toBe(true);
    expect(canViewBillingSummaries("contabilidad")).toBe(true);
  });

  it("other roles cannot edit the invoice header", () => {
    for (const rol of ["contabilidad", "mesero", "cocina", "unknown", null]) {
      expect(canEditInvoiceHeader(rol)).toBe(false);
    }
  });
});

describe("app route permissions by role", () => {
  it("allows contabilidad and cajera to access /historial and legacy /fiscal", () => {
    expect(isAppRouteAllowed("cajera", "/historial")).toBe(true);
    expect(isAppRouteAllowed("cajera", "/fiscal")).toBe(true);
    expect(isAppRouteAllowed("contabilidad", "/historial")).toBe(true);
    expect(isAppRouteAllowed("contabilidad", "/fiscal")).toBe(true);
  });

  it("strictly forbids non-admins from accessing /ajustes", () => {
    for (const rol of ["cajera", "contabilidad", "mesero", "cocina", null]) {
      expect(isAppRouteAllowed(rol, "/ajustes")).toBe(false);
    }
    expect(isAppRouteAllowed("admin", "/ajustes")).toBe(true);
  });

  it("restricts mesero and cocina from accessing /historial", () => {
    expect(isAppRouteAllowed("mesero", "/historial")).toBe(false);
    expect(isAppRouteAllowed("cocina", "/historial")).toBe(false);
  });
});
