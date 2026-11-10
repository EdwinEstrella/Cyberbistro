import { describe, expect, it } from "vitest";
import {
  CONSUMO_DETAIL_THRESHOLD,
  MAX_RECORDS,
  buildFormato607Rows,
  consumoSummary,
  generateFormato607,
  type Formato607InvoiceInput,
  type VentaFiscal607,
} from "./formato607";

describe("DGII Formato 607 Pure Module", () => {
  const defaultPeriod = "202608";
  const defaultEmitterRnc = "131123456";

  const sampleB01Invoice: Formato607InvoiceInput = {
    id: "inv-b01",
    numero_factura: 101,
    ncf: "B0100000123",
    ncf_tipo: "B01",
    cliente_rnc: "101123456", // 9 digits -> tipo 1
    subtotal: 1000,
    itbis: 180,
    propina: 100,
    total: 1280,
    metodo_pago: "efectivo",
    estado: "pagada",
    created_at: "2026-08-05T12:00:00Z",
    pagada_at: "2026-08-05T12:30:00Z",
  };

  it("exports constants according to DGII regulations", () => {
    expect(CONSUMO_DETAIL_THRESHOLD).toBe(250000);
    expect(MAX_RECORDS).toBe(65000);
  });

  it("produces expected first 3 lines of TXT and CSV for multi-row fixture", () => {
    const invoices: Formato607InvoiceInput[] = [
      sampleB01Invoice,
      {
        id: "inv-e31",
        numero_factura: 102,
        ncf: "E310000000045",
        cliente_rnc: "00112345678",
        subtotal: 2500,
        itbis: 450,
        propina: 250,
        total: 3200,
        metodo_pago: "tarjeta",
        estado: "pagada",
        created_at: "2026-08-10T15:00:00Z",
      },
    ];

    const rows = buildFormato607Rows(invoices, defaultPeriod);
    const txt = generateFormato607(defaultEmitterRnc, defaultPeriod, rows, "txt");
    const csv = generateFormato607(defaultEmitterRnc, defaultPeriod, rows, "csv");

    const txtLines = txt.split("\r\n");
    expect(txtLines[0]).toBe("607|131123456|202608|2");
    expect(txtLines[1]).toBe("101123456|1|B0100000123||1|20260805||1000.00|180.00|0.00|0.00|0.00|0.00|0.00|0.00|100.00|1280.00|0.00|0.00|0.00|0.00|0.00|0.00");
    expect(txtLines[2]).toBe("00112345678|2|E310000000045||1|20260810||2500.00|450.00|0.00|0.00|0.00|0.00|0.00|0.00|250.00|0.00|0.00|3200.00|0.00|0.00|0.00|0.00");

    const csvLines = csv.replace("\uFEFF", "").split("\r\n");
    expect(csvLines[0]).toBe("RNC/Cédula,Tipo Id,NCF,NCF Modificado,Tipo Ingreso,Fecha Comprobante,Fecha Retención,Monto Facturado,ITBIS Facturado,ITBIS Retenido Terceros,ITBIS Percibido,Retención Renta Terceros,ISR Percibido,ISC,Otros Impuestos,Propina Legal,Efectivo,Cheque/Transferencia/Depósito,Tarjeta Débito/Crédito,Venta a Crédito,Bonos/Certificados,Permuta,Otras Formas");
    expect(csvLines[1]).toBe("101123456,1,B0100000123,,1,20260805,,1000.00,180.00,0.00,0.00,0.00,0.00,0.00,0.00,100.00,1280.00,0.00,0.00,0.00,0.00,0.00,0.00");
    expect(csvLines[2]).toBe("00112345678,2,E310000000045,,1,20260810,,2500.00,450.00,0.00,0.00,0.00,0.00,0.00,0.00,250.00,0.00,0.00,3200.00,0.00,0.00,0.00,0.00");
  });

  describe("header and 23 columns order", () => {
    it("generates header '607|RNC|AAAAMM|recordCount' and 23 detail columns in TXT", () => {
      const rows = buildFormato607Rows([sampleB01Invoice], defaultPeriod);
      expect(rows).toHaveLength(1);

      const txt = generateFormato607(defaultEmitterRnc, defaultPeriod, rows, "txt");
      const [header, detail] = txt.split("\r\n");

      expect(header).toBe(`607|${defaultEmitterRnc}|${defaultPeriod}|1`);
      const cols = detail.split("|");
      expect(cols).toHaveLength(23);

      // Col 1: RNC Comprador
      expect(cols[0]).toBe("101123456");
      // Col 2: Tipo Id (1 = RNC)
      expect(cols[1]).toBe("1");
      // Col 3: NCF
      expect(cols[2]).toBe("B0100000123");
      // Col 4: NCF Modificado (empty for standard invoice)
      expect(cols[3]).toBe("");
      // Col 5: Tipo Ingreso (1 = Ingresos por operaciones)
      expect(cols[4]).toBe("1");
      // Col 6: Fecha comprobante (AAAAMMDD)
      expect(cols[5]).toBe("20260805");
      // Col 7: Fecha retención (empty)
      expect(cols[6]).toBe("");
      // Col 8: Monto facturado (subtotal sin ITBIS ni propina)
      expect(cols[7]).toBe("1000.00");
      // Col 9: ITBIS facturado
      expect(cols[8]).toBe("180.00");
      // Col 10: ITBIS retenido por terceros (0.00)
      expect(cols[9]).toBe("0.00");
      // Col 11: ITBIS percibido (0.00)
      expect(cols[10]).toBe("0.00");
      // Col 12: Retención renta por terceros (0.00)
      expect(cols[11]).toBe("0.00");
      // Col 13: ISR percibido (0.00)
      expect(cols[12]).toBe("0.00");
      // Col 14: ISC (0.00)
      expect(cols[13]).toBe("0.00");
      // Col 15: Otros impuestos (0.00)
      expect(cols[14]).toBe("0.00");
      // Col 16: Propina legal
      expect(cols[15]).toBe("100.00");
      // Col 17: Efectivo (1280.00)
      expect(cols[16]).toBe("1280.00");
      // Col 18: Cheque / Transferencia (0.00)
      expect(cols[17]).toBe("0.00");
      // Col 19: Tarjeta (0.00)
      expect(cols[18]).toBe("0.00");
      // Col 20: Venta a crédito (0.00)
      expect(cols[19]).toBe("0.00");
      // Col 21: Bonos / Certificados (0.00)
      expect(cols[20]).toBe("0.00");
      // Col 22: Permuta (0.00)
      expect(cols[21]).toBe("0.00");
      // Col 23: Otras formas de ventas (0.00)
      expect(cols[22]).toBe("0.00");
    });
  });

  describe("Dominican local time (America/Santo_Domingo, UTC-4)", () => {
    it("reports late-night sale at 2026-09-01T02:00:00Z (22:00 Aug 31 local) in August with date 20260831", () => {
      const lateSale: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        id: "late-aug",
        created_at: "2026-09-01T02:00:00Z",
        pagada_at: "2026-09-01T02:00:00Z",
      };
      const rows = buildFormato607Rows([lateSale], "202608");
      expect(rows).toHaveLength(1);
      expect(rows[0].fecha_comprobante).toBe("2026-08-31");

      const txt = generateFormato607(defaultEmitterRnc, "202608", rows);
      const detailLine = txt.split("\r\n")[1];
      const cols = detailLine.split("|");
      expect(cols[5]).toBe("20260831"); // column 6: Fecha comprobante
    });

    it("reports sale at 2026-08-01T03:30:00Z (23:30 Jul 31 local) in July with date 20260731", () => {
      const lateJulySale: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        id: "late-jul",
        created_at: "2026-08-01T03:30:00Z",
        pagada_at: "2026-08-01T03:30:00Z",
      };
      const rows = buildFormato607Rows([lateJulySale], "202607");
      expect(rows).toHaveLength(1);
      expect(rows[0].fecha_comprobante).toBe("2026-07-31");

      const txt = generateFormato607(defaultEmitterRnc, "202607", rows);
      const detailLine = txt.split("\r\n")[1];
      const cols = detailLine.split("|");
      expect(cols[5]).toBe("20260731");
    });

    it("leaves noon sale unchanged", () => {
      const noonSale: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        id: "noon-sale",
        created_at: "2026-08-15T12:00:00Z",
        pagada_at: "2026-08-15T12:00:00Z",
      };
      const rows = buildFormato607Rows([noonSale], "202608");
      expect(rows).toHaveLength(1);
      expect(rows[0].fecha_comprobante).toBe("2026-08-15");

      const txt = generateFormato607(defaultEmitterRnc, "202608", rows);
      const cols = txt.split("\r\n")[1].split("|");
      expect(cols[5]).toBe("20260815");
    });
  });

  describe("tipo de identificación mapping", () => {
    it("maps 9-digit RNC to Tipo Id 1", () => {
      const inv: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        cliente_rnc: "1-31-12345-6", // digits: 131123456 (9 digits)
      };
      const [row] = buildFormato607Rows([inv], defaultPeriod);
      expect(row.tipo_identificacion).toBe("1");
      expect(row.rnc_cedula).toBe("131123456");
    });

    it("maps 11-digit Cédula to Tipo Id 2", () => {
      const inv: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        cliente_rnc: "001-1234567-8", // digits: 00112345678 (11 digits)
      };
      const [row] = buildFormato607Rows([inv], defaultPeriod);
      expect(row.tipo_identificacion).toBe("2");
      expect(row.rnc_cedula).toBe("00112345678");
    });

    it("maps non-numeric passport or foreign tax ID to Tipo Id 3 and strips spaces/pipes", () => {
      const inv: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        cliente_rnc: "PAS | 12345",
      };
      const [row] = buildFormato607Rows([inv], defaultPeriod);
      expect(row.tipo_identificacion).toBe("3");
      expect(row.rnc_cedula).toBe("PAS12345");
    });

    it("rejects 8-digit numeric ID naming the NCF", () => {
      const inv: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        cliente_rnc: "12345678",
      };
      expect(() => buildFormato607Rows([inv], defaultPeriod)).toThrow(
        "El comprobante B0100000123 tiene un RNC o cédula con longitud inválida."
      );
    });

    it("rejects 10-digit numeric ID naming the NCF", () => {
      const inv: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        cliente_rnc: "1234567890",
      };
      expect(() => buildFormato607Rows([inv], defaultPeriod)).toThrow(
        "El comprobante B0100000123 tiene un RNC o cédula con longitud inválida."
      );
    });
  });

  describe("inclusion rules by NCF type and threshold", () => {
    it("includes B01, B14, B15, and E31 in detail regardless of amount", () => {
      const invoices: Formato607InvoiceInput[] = [
        { ...sampleB01Invoice, id: "b01", ncf: "B0100000001", total: 100 },
        { ...sampleB01Invoice, id: "b14", ncf: "B1400000001", total: 200 },
        { ...sampleB01Invoice, id: "b15", ncf: "B1500000001", total: 300 },
        { ...sampleB01Invoice, id: "e31", ncf: "E310000000001", total: 400 },
      ];
      const rows = buildFormato607Rows(invoices, defaultPeriod);
      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.ncf)).toEqual([
        "B0100000001",
        "B1400000001",
        "B1500000001",
        "E310000000001",
      ]);
    });

    it("excludes B02 and E32 consumo invoices below RD$250,000 from detail", () => {
      const invoices: Formato607InvoiceInput[] = [
        { ...sampleB01Invoice, id: "b02-small", ncf: "B0200000001", total: 249999.99 },
        { ...sampleB01Invoice, id: "e32-small", ncf: "E320000000001", total: 1500 },
      ];
      const rows = buildFormato607Rows(invoices, defaultPeriod);
      expect(rows).toHaveLength(0);
    });

    it("includes B02 and E32 consumo invoices of RD$250,000 or more in detail", () => {
      const invoices: Formato607InvoiceInput[] = [
        { ...sampleB01Invoice, id: "b02-large", ncf: "B0200000002", total: 250000, subtotal: 211864.41, itbis: 38135.59 },
        { ...sampleB01Invoice, id: "e32-large", ncf: "E320000000002", total: 300000, subtotal: 254237.29, itbis: 45762.71 },
      ];
      const rows = buildFormato607Rows(invoices, defaultPeriod);
      expect(rows).toHaveLength(2);
      expect(rows[0].ncf).toBe("B0200000002");
      expect(rows[1].ncf).toBe("E320000000002");
    });
  });

  describe("credit notes", () => {
    it("includes credit notes with ref_ncf in column 4 and positive magnitudes", () => {
      const originalInvoice: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        id: "orig-1",
        ncf: "E310000000001",
        cliente_rnc: "130862346",
      };

      const creditNote: Formato607InvoiceInput = {
        id: "nc-1",
        estado: "nota_credito",
        ncf: "E340000000001",
        credit_note_of: "orig-1",
        ref_ncf: "E310000000001",
        cliente_rnc: null, // should inherit from orig-1
        subtotal: -500,
        itbis: -90,
        propina: 0,
        total: -590,
        metodo_pago: "efectivo",
        created_at: "2026-08-10T10:00:00Z",
      };

      const rows = buildFormato607Rows([originalInvoice, creditNote], defaultPeriod);
      expect(rows).toHaveLength(2);

      const ncRow = rows.find((r) => r.ncf === "E340000000001")!;
      expect(ncRow.ncf_modificado).toBe("E310000000001");
      expect(ncRow.rnc_cedula).toBe("130862346");
      expect(ncRow.monto_facturado).toBe(500);
      expect(ncRow.itbis_facturado).toBe(90);
      expect(ncRow.efectivo).toBe(590);

      const txt = generateFormato607(defaultEmitterRnc, defaultPeriod, [ncRow]);
      const cols = txt.split("\r\n")[1].split("|");
      expect(cols[2]).toBe("E340000000001");
      expect(cols[3]).toBe("E310000000001");
      expect(cols[7]).toBe("500.00");
      expect(cols[8]).toBe("90.00");
      expect(cols[16]).toBe("590.00");
    });
  });

  describe("credit sales (fiado) and exclusions", () => {
    it("includes fiado sale with estado pendiente with column 20 = total", () => {
      const fiadoPendiente: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        id: "fiado-1",
        estado: "pendiente",
        metodo_pago: "fiado",
        subtotal: 1000,
        itbis: 180,
        propina: 0,
        total: 1180,
      };

      const rows = buildFormato607Rows([fiadoPendiente], defaultPeriod);
      expect(rows).toHaveLength(1);
      expect(rows[0].venta_credito).toBe(1180);
      expect(rows[0].efectivo).toBe(0);

      const txt = generateFormato607(defaultEmitterRnc, defaultPeriod, rows);
      const cols = txt.split("\r\n")[1].split("|");
      expect(cols[19]).toBe("1180.00"); // Column 20 (index 19): Venta a crédito
    });

    it("includes paid fiado sale in column 20", () => {
      const fiadoPagada: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        id: "fiado-paid",
        estado: "pagada",
        metodo_pago: "fiado",
        subtotal: 500,
        itbis: 90,
        propina: 0,
        total: 590,
      };

      const rows = buildFormato607Rows([fiadoPagada], defaultPeriod);
      expect(rows).toHaveLength(1);
      expect(rows[0].venta_credito).toBe(590);
    });

    it("excludes non-fiado pendiente invoice", () => {
      const efectivoPendiente: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        id: "cash-pend",
        estado: "pendiente",
        metodo_pago: "efectivo",
      };
      const rows = buildFormato607Rows([efectivoPendiente], defaultPeriod);
      expect(rows).toHaveLength(0);
    });

    it("includes fiado pendiente B02 under 250k in consumo summary", () => {
      const fiadoConsumo: Formato607InvoiceInput = {
        id: "fiado-consumo",
        ncf: "B0200000001",
        subtotal: 700,
        itbis: 126,
        propina: 0,
        total: 826,
        metodo_pago: "fiado",
        estado: "pendiente",
        created_at: "2026-08-15T12:00:00Z",
      };

      const summary = consumoSummary([fiadoConsumo], defaultPeriod);
      expect(summary.count).toBe(1);
      expect(summary.totalMontoFacturado).toBe(700);
    });

    it("excludes internal receipts and invoices without NCF", () => {
      const invoices: Formato607InvoiceInput[] = [
        { ...sampleB01Invoice, id: "no-ncf", ncf: null },
        { ...sampleB01Invoice, id: "empty-ncf", ncf: "   " },
        { ...sampleB01Invoice, id: "internal", ncf: "INT001", fiscal_mode: "internal_receipt" },
      ];
      const rows = buildFormato607Rows(invoices, defaultPeriod);
      expect(rows).toHaveLength(0);
    });

    it("excludes cancelada invoices always", () => {
      const invoices: Formato607InvoiceInput[] = [
        { ...sampleB01Invoice, id: "canc-1", estado: "cancelada", metodo_pago: "efectivo" },
        { ...sampleB01Invoice, id: "canc-2", estado: "cancelada", metodo_pago: "fiado" },
      ];
      const rows = buildFormato607Rows(invoices, defaultPeriod);
      expect(rows).toHaveLength(0);
    });

    it("excludes invoices outside the selected month using fiscal date (pagada_at ?? created_at)", () => {
      const invoices: Formato607InvoiceInput[] = [
        // pagada_at in July 2026 (Jul 31 19:59:59 local), created in August -> excluded from August
        { ...sampleB01Invoice, id: "jul", created_at: "2026-08-01T00:00:00Z", pagada_at: "2026-07-31T23:59:59Z" },
        // pagada_at in September 2026 (Sep 2 08:00 local) -> excluded from August
        { ...sampleB01Invoice, id: "sep", created_at: "2026-08-31T00:00:00Z", pagada_at: "2026-09-02T12:00:00Z" },
        // pagada_at null, created_at in August -> included
        { ...sampleB01Invoice, id: "aug", pagada_at: null, created_at: "2026-08-15T10:00:00Z" },
      ];
      const rows = buildFormato607Rows(invoices, defaultPeriod);
      expect(rows).toHaveLength(1);
      expect(rows[0].ncf).toBe(sampleB01Invoice.ncf);
    });
  });

  describe("payment method split (columns 17-23)", () => {
    it("splits payments correctly for single payment methods", () => {
      const methods: Array<{ method: string; expectedColIndex: number }> = [
        { method: "efectivo", expectedColIndex: 16 }, // col 17: efectivo
        { method: "transferencia", expectedColIndex: 17 }, // col 18: cheque/transf
        { method: "tarjeta", expectedColIndex: 18 }, // col 19: tarjeta
        { method: "fiado", expectedColIndex: 19 }, // col 20: venta a credito
        { method: "credito", expectedColIndex: 19 }, // col 20: venta a credito
        { method: "bonos", expectedColIndex: 20 }, // col 21: bonos
        { method: "permuta", expectedColIndex: 21 }, // col 22: permuta
        { method: "digital", expectedColIndex: 22 }, // col 23: otras formas
      ];

      for (const { method, expectedColIndex } of methods) {
        const inv: Formato607InvoiceInput = {
          ...sampleB01Invoice,
          id: `inv-${method}`,
          metodo_pago: method,
          total: 1000,
          subtotal: 1000,
          itbis: 0,
          propina: 0,
        };
        const [row] = buildFormato607Rows([inv], defaultPeriod);
        const txt = generateFormato607(defaultEmitterRnc, defaultPeriod, [row]);
        const cols = txt.split("\r\n")[1].split("|");

        for (let c = 16; c <= 22; c++) {
          if (c === expectedColIndex) {
            expect(cols[c]).toBe("1000.00");
          } else {
            expect(cols[c]).toBe("0.00");
          }
        }
      }
    });
  });

  describe("CSV generation", () => {
    it("generates CSV with UTF-8 BOM and correct column headers", () => {
      const rows = buildFormato607Rows([sampleB01Invoice], defaultPeriod);
      const csv = generateFormato607(defaultEmitterRnc, defaultPeriod, rows, "csv");

      expect(csv.startsWith("\uFEFF")).toBe(true);
      const lines = csv.split("\r\n");
      expect(lines).toHaveLength(2);

      const headerCols = lines[0].replace("\uFEFF", "").split(",");
      expect(headerCols).toHaveLength(23);
      expect(headerCols[0]).toBe("RNC/Cédula");
      expect(headerCols[2]).toBe("NCF");

      const detailCols = lines[1].split(",");
      expect(detailCols).toHaveLength(23);
      expect(detailCols[0]).toBe("101123456");
      expect(detailCols[2]).toBe("B0100000123");
      expect(detailCols[7]).toBe("1000.00");
    });
  });

  describe("consumoSummary", () => {
    it("summarizes consumo invoices below RD$250,000 for the period", () => {
      const invoices: Formato607InvoiceInput[] = [
        {
          id: "c1",
          ncf: "B0200000001",
          subtotal: 500,
          itbis: 90,
          propina: 50,
          total: 640,
          estado: "pagada",
          created_at: "2026-08-01T10:00:00Z",
        },
        {
          id: "c2",
          ncf: "E320000000001",
          subtotal: 1000,
          itbis: 180,
          propina: 0,
          total: 1180,
          estado: "pagada",
          created_at: "2026-08-02T10:00:00Z",
        },
        // B02 >= 250,000 -> not in consumo summary (goes to detail)
        {
          id: "c3",
          ncf: "B0200000002",
          subtotal: 250000,
          itbis: 45000,
          propina: 0,
          total: 295000,
          estado: "pagada",
          cliente_rnc: "101123456",
          created_at: "2026-08-03T10:00:00Z",
        },
        // B01 -> not consumo
        { ...sampleB01Invoice, id: "b01-other" },
        // Cancelled consumo -> excluded
        {
          id: "c4",
          ncf: "B0200000003",
          subtotal: 200,
          total: 236,
          estado: "cancelada",
          created_at: "2026-08-04T10:00:00Z",
        },
      ];

      const summary = consumoSummary(invoices, defaultPeriod);
      expect(summary.count).toBe(2);
      expect(summary.totalMontoFacturado).toBe(1500); // 500 + 1000
    });

    it("avoids float artifacts by rounding accumulated sum to 2 decimals", () => {
      const invoices: Formato607InvoiceInput[] = [
        {
          id: "f1",
          ncf: "B0200000010",
          subtotal: 0.1,
          total: 0.1,
          estado: "pagada",
          created_at: "2026-08-01T10:00:00Z",
        },
        {
          id: "f2",
          ncf: "B0200000011",
          subtotal: 0.2,
          total: 0.2,
          estado: "pagada",
          created_at: "2026-08-01T11:00:00Z",
        },
      ];
      const summary = consumoSummary(invoices, defaultPeriod);
      expect(summary.totalMontoFacturado).toBe(0.3);
    });
  });

  describe("validations and error handling", () => {
    it("rejects invalid emitter RNC", () => {
      const rows = buildFormato607Rows([sampleB01Invoice], defaultPeriod);
      expect(() => generateFormato607("12345", defaultPeriod, rows)).toThrow(
        "El RNC o cédula del emisor no es válido."
      );
    });

    it("rejects invalid period format", () => {
      const rows = buildFormato607Rows([sampleB01Invoice], defaultPeriod);
      expect(() => generateFormato607(defaultEmitterRnc, "2026-08", rows)).toThrow(
        "El período debe usar el formato AAAAMM."
      );
    });

    it("throws clear error naming the NCF when buyer id is missing for detail rows", () => {
      const invWithoutBuyer: Formato607InvoiceInput = {
        ...sampleB01Invoice,
        cliente_rnc: null,
      };
      expect(() => buildFormato607Rows([invWithoutBuyer], defaultPeriod)).toThrow(
        /B0100000123/
      );
    });

    it("throws error when credit note cannot resolve buyer id from parent", () => {
      const creditNote: Formato607InvoiceInput = {
        id: "nc-orphan",
        estado: "nota_credito",
        ncf: "E340000000999",
        credit_note_of: "parent-not-found",
        cliente_rnc: null,
        subtotal: 100,
        itbis: 18,
        total: 118,
        metodo_pago: "efectivo",
        created_at: "2026-08-10T10:00:00Z",
      };
      expect(() => buildFormato607Rows([creditNote], defaultPeriod)).toThrow(
        /E340000000999/
      );
    });

    it("throws clear Spanish error when rows exceed MAX_RECORDS (65,000)", () => {
      const hugeRows: VentaFiscal607[] = new Array(65001).fill(null).map(() => ({
        rnc_cedula: "101123456",
        tipo_identificacion: "1",
        ncf: `B0100000001`,
        ncf_modificado: null,
        tipo_ingreso: "1",
        fecha_comprobante: "2026-08-01",
        fecha_retencion: null,
        monto_facturado: 100,
        itbis_facturado: 18,
        itbis_retenido: 0,
        itbis_percibido: 0,
        retencion_renta: 0,
        isr_percibido: 0,
        impuesto_selectivo: 0,
        otros_impuestos: 0,
        propina_legal: 0,
        efectivo: 118,
        cheque_transferencia_deposito: 0,
        tarjeta: 0,
        venta_credito: 0,
        bonos_certificados: 0,
        permuta: 0,
        otras_formas: 0,
      }));

      expect(() => generateFormato607(defaultEmitterRnc, defaultPeriod, hugeRows)).toThrow(
        /65,000/
      );
    });
  });
});
