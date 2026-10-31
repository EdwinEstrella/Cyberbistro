import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildEmployeeSummary,
  buildStatementFileName,
  formatStatementDate,
  formatStatementMoney,
  formatStatementPeriod,
  getDefaultStatementDateRange,
  getDaysDifference,
  sanitizeCompanySlug,
  validateStatementDateRange,
} from "./statementFormat";
import { buildStatementPdf } from "./statementPdf";
import { fetchCompanyStatement, ONLINE_REQUIRED_ERROR } from "./statementApi";
import type { CompanyStatementData, StatementTenantInfo } from "../types";

describe("statementFormat helpers", () => {
  it("formats dates from YYYY-MM-DD to dd/mm/yyyy", () => {
    expect(formatStatementDate("2026-10-31")).toBe("31/10/2026");
    expect(formatStatementDate("2026-01-05")).toBe("05/01/2026");
    expect(formatStatementDate("")).toBe("—");
  });

  it("formats statement period correctly", () => {
    expect(formatStatementPeriod("2026-10-01", "2026-10-31")).toBe(
      "Del 01/10/2026 al 31/10/2026"
    );
  });

  it("formats money amounts with DOP as default", () => {
    expect(formatStatementMoney(1234.5)).toBe("RD$ 1,234.50");
    expect(formatStatementMoney(0)).toBe("RD$ 0.00");
    expect(formatStatementMoney(500, "ARS")).toBe("AR$ 500,00");
  });

  it("calculates default statement date range in America/Santo_Domingo", () => {
    // 2026-10-15T12:00:00Z is 2026-10-15 in Santo Domingo (UTC-4)
    const fixedDate = new Date("2026-10-15T12:00:00Z");
    const range = getDefaultStatementDateRange(fixedDate);
    expect(range.from).toBe("2026-10-01");
    expect(range.to).toBe("2026-10-15");
  });

  it("calculates day difference accurately", () => {
    expect(getDaysDifference("2026-10-01", "2026-10-31")).toBe(30);
    expect(getDaysDifference("2026-10-01", "2026-10-01")).toBe(0);
    expect(getDaysDifference("2026-10-31", "2026-10-01")).toBe(-30);
  });

  it("validates statement date range", () => {
    // Valid cases
    expect(validateStatementDateRange("2026-10-01", "2026-10-31")).toEqual({
      valid: true,
    });
    expect(validateStatementDateRange("2026-01-01", "2026-12-31")).toEqual({
      valid: true,
    });

    // Missing dates
    expect(validateStatementDateRange("", "2026-10-31").valid).toBe(false);
    expect(validateStatementDateRange("2026-10-01", "").valid).toBe(false);

    // Invalid format
    expect(validateStatementDateRange("01/10/2026", "2026-10-31").valid).toBe(
      false
    );

    // from > to
    const reversed = validateStatementDateRange("2026-10-31", "2026-10-01");
    expect(reversed.valid).toBe(false);
    expect(reversed.error).toContain("no puede ser posterior");

    // > 366 days
    const tooLong = validateStatementDateRange("2025-01-01", "2026-01-10");
    expect(tooLong.valid).toBe(false);
    expect(tooLong.error).toContain("366");
  });

  it("creates a safe slug for company name", () => {
    expect(sanitizeCompanySlug("Acme Corp, S.R.L.")).toBe("acme-corp-s-r-l");
    expect(sanitizeCompanySlug("Cafetería & Restaurante El Sol")).toBe(
      "cafeteria-restaurante-el-sol"
    );
    expect(sanitizeCompanySlug("")).toBe("empresa");
  });

  it("builds the standard file name", () => {
    const fileName = buildStatementFileName(
      "Acme Dominicana",
      "2026-10-01",
      "2026-10-31"
    );
    expect(fileName).toBe("estado-cuenta_acme-dominicana_2026-10-01_2026-10-31.pdf");
  });

  it("aggregates and sorts per-employee summary descending by total amount", () => {
    const rows = [
      {
        date: "2026-10-05",
        numero_pedido: 101,
        employee_name: "Carlos Ruiz",
        monto_total: 500,
        monto_pagado: 500,
      },
      {
        date: "2026-10-06",
        numero_pedido: 102,
        employee_name: "Ana Gomez",
        monto_total: 1200,
        monto_pagado: 600,
      },
      {
        date: "2026-10-07",
        numero_pedido: 103,
        employee_name: "Carlos Ruiz",
        monto_total: 800,
        monto_pagado: 0,
      },
    ];

    const summary = buildEmployeeSummary(rows);
    expect(summary).toHaveLength(2);
    // Carlos Ruiz total: 1300 (2 orders)
    // Ana Gomez total: 1200 (1 order)
    expect(summary[0]).toEqual({
      employeeName: "Carlos Ruiz",
      orderCount: 2,
      totalAmount: 1300,
    });
    expect(summary[1]).toEqual({
      employeeName: "Ana Gomez",
      orderCount: 1,
      totalAmount: 1200,
    });
  });
});

describe("buildStatementPdf", () => {
  const sampleData: CompanyStatementData = {
    customer: {
      name: "Distribuidora Los Prados S.R.L.",
      document_id: "131880681",
    },
    from: "2026-10-01",
    to: "2026-10-31",
    rows: [
      {
        date: "2026-10-02",
        numero_pedido: 1001,
        employee_name: "Marcos Diaz",
        monto_total: 450,
        monto_pagado: 450,
      },
      {
        date: "2026-10-05",
        numero_pedido: 1002,
        employee_name: "Laura Pena",
        monto_total: 1550,
        monto_pagado: 550,
      },
    ],
    totals: {
      count: 2,
      total: 2000,
      paid: 1000,
      pending: 1000,
    },
  };

  const sampleTenant: StatementTenantInfo = {
    nombre_negocio: "Bistro Cyber",
    rnc: "101999888",
    telefono: "809-555-0100",
    direccion: "Av. Winston Churchill 45",
    logo_url: null,
    moneda: "DOP",
  };

  it("asserts page size is A4 (210 x 297 mm), title text present, totals text present, and NO item names appear", () => {
    const doc = buildStatementPdf(sampleData, sampleTenant, {
      compress: false,
      issueDate: "2026-10-31",
    });

    // 1. Assert page size is A4
    const width = Math.round(doc.internal.pageSize.getWidth());
    const height = Math.round(doc.internal.pageSize.getHeight());
    expect(width).toBe(210);
    expect(height).toBe(297);

    // 2. Extract PDF output stream content
    const pdfText = doc.output();

    // 3. Assert title text present
    expect(pdfText).toContain("ESTADO DE CUENTA");

    // 4. Assert totals text present
    expect(pdfText).toContain("TOTAL");
    expect(pdfText).toContain("PAGADO");
    expect(pdfText).toContain("PENDIENTE");
    expect(pdfText).toContain("CANTIDAD DE PEDIDOS");
    expect(pdfText).toContain("RD$ 2,000.00");
    expect(pdfText).toContain("RD$ 1,000.00");

    // 5. Assert customer and tenant info present
    expect(pdfText).toContain("Distribuidora Los Prados S.R.L.");
    expect(pdfText).toContain("131880681");
    expect(pdfText).toContain("Bistro Cyber");

    // 6. Assert NO item names appear (rows only carry amounts and order numbers)
    const mockDishItems = [
      "Mofongo Criollo",
      "Hamburguesa Doble Queso",
      "Papas Fritas",
      "Pollo Al Horno",
      "Arroz con Habichuelas",
    ];
    for (const dish of mockDishItems) {
      expect(pdfText).not.toContain(dish);
    }
  });

  it("handles multi-page statements and repeats table header", () => {
    // Generate 60 rows to force multiple pages
    const manyRows = Array.from({ length: 60 }, (_, i) => ({
      date: "2026-10-10",
      numero_pedido: 2000 + i,
      employee_name: `Empleado ${i + 1}`,
      monto_total: 350,
      monto_pagado: 100,
    }));

    const bigData: CompanyStatementData = {
      ...sampleData,
      rows: manyRows,
      totals: {
        count: 60,
        total: 21000,
        paid: 6000,
        pending: 15000,
      },
    };

    const doc = buildStatementPdf(bigData, sampleTenant, { compress: false });
    const pageCount = doc.getNumberOfPages();
    expect(pageCount).toBeGreaterThan(1);

    const pdfText = doc.output();
    expect(pdfText).toContain("Página 1 de ");
    expect(pdfText).toContain(`Página ${pageCount} de ${pageCount}`);
  });
});

describe("fetchCompanyStatement online-only enforcement", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws clear error when navigator.onLine is false", async () => {
    const originalNavigator = globalThis.navigator;
    try {
      Object.defineProperty(globalThis, "navigator", {
        value: { onLine: false },
        configurable: true,
      });

      await expect(
        fetchCompanyStatement("some-customer-id", "2026-10-01", "2026-10-31")
      ).rejects.toThrow(ONLINE_REQUIRED_ERROR);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    }
  });
});
