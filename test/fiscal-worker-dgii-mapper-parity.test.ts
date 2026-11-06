import { describe, expect, it, vi } from "vitest";
import { createUnsignedEcfXml } from "../worker/fiscal/mapper";
import { convertECF32ToRFCE, describeDgiiError, isDgiiTerminalError, RealDgiiClient } from "../worker/fiscal/dgiiAdapters";
import type { FiscalWorkerSnapshot } from "../worker/fiscal/types";
import { FiscalWorker } from "../worker/fiscal/fiscalWorker";

function makeSnapshot(overrides: {
  factura?: Record<string, unknown>;
  tenant?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
}): FiscalWorkerSnapshot {
  const defaultRangos = {
    E31: { start: 1, end: 300, vence: "31-12-2027" },
    E32: { start: 1, end: 500, vence: "31-12-2027" },
    E34: { start: 1, end: 100, vence: "31-12-2027" },
  };
  // ecf_secuencias_rangos lives on the snapshot top-level; derive from merged tenant override
  const effectiveRangos = overrides.tenant && "ecf_secuencias_rangos" in overrides.tenant
    ? (overrides.tenant.ecf_secuencias_rangos as Record<string, unknown> | undefined)
    : defaultRangos;

  return {
    ecf_secuencias_rangos: effectiveRangos ?? undefined,
    job: {
      id: "job-1",
      tenantId: "tenant-1",
      ecfDocumentId: "doc-1",
      facturaId: "factura-1",
      operation: "submit",
      status: "queued",
      attempts: 0,
      idempotencyKey: "idem-1",
    },
    document: {
      id: "doc-1",
      tenantId: "tenant-1",
      facturaId: "factura-1",
      status: "queued",
      certificateMetadataId: "cert-1",
      dgiiTrackId: null,
      rfce_threshold_used: null,
      rejection_scope: null,
      batchId: null,
    },
    certificate: {
      id: "cert-1",
      tenantId: "tenant-1",
      environment: "production",
      isReady: true,
      validUntil: "2030-12-31T23:59:59.000Z",
    },
    invoicePayload: {
      factura: {
        created_at: "2026-10-24T12:00:00.000Z",
        cliente_rnc: "1-30-86234-6",
        cliente_nombre: "Salpimentao Gourmet SRL",
        ncf: "E310000000001",
        subtotal: 100,
        itbis: 18,
        total: 118,
        ...overrides.factura,
      },
      tenant: {
        rnc: "1-30-86234-6",
        nombre_negocio: "CYBERBISTRO SRL",
        direccion: "Av. Winston Churchill",
        ecf_issuer_sucursal: "Principal",
        ecf_issuer_municipio: "Santo Domingo Centro",
        ecf_issuer_provincia: "Distrito Nacional",
        ecf_issuer_actividad_economica: "6201",
        ecf_issuer_correo_emisor: "factura@cyberbistro.app",
        telefono: "809-555-1234",
        ecf_secuencias_rangos: defaultRangos,
        ...overrides.tenant,
      },
      items: overrides.items ?? [
        { plato_id: 101, nombre: "Mofongo Especial", cantidad: 1, precio_unitario: 100, subtotal: 100 },
      ],
      payments: overrides.payments ?? [
        { payment_method: "efectivo", amount: 118 },
      ],
    },
  } as unknown as FiscalWorkerSnapshot;
}

const FIXED_NOW = new Date("2026-10-24T16:00:00.000Z");

describe("DGII XML parity & XSD conformance (E31, E32, E34)", () => {
  it("emits Version as the string '1.0' (not number 1)", () => {
    const xml = createUnsignedEcfXml(makeSnapshot({}), FIXED_NOW);
    expect(xml).toContain("<Version>1.0</Version>");
    expect(xml).not.toMatch(/<Version>1<\/Version>/);
  });

  it("strips dashes from RNCEmisor and RNCComprador", () => {
    const xml = createUnsignedEcfXml(makeSnapshot({}), FIXED_NOW);
    expect(xml).toContain("<RNCEmisor>130862346</RNCEmisor>");
    expect(xml).toContain("<RNCComprador>130862346</RNCComprador>");
    expect(xml).not.toContain("1-30-86234-6");
  });

  it("orders Encabezado sections as Version -> IdDoc -> Emisor -> Comprador -> Totales", () => {
    const xml = createUnsignedEcfXml(makeSnapshot({}), FIXED_NOW);
    const posVersion = xml.indexOf("<Version>1.0</Version>");
    const posIdDoc = xml.indexOf("<IdDoc>");
    const posEmisor = xml.indexOf("<Emisor>");
    const posComprador = xml.indexOf("<Comprador>");
    const posTotales = xml.indexOf("<Totales>");

    expect(posVersion).toBeGreaterThan(-1);
    expect(posIdDoc).toBeGreaterThan(posVersion);
    expect(posEmisor).toBeGreaterThan(posIdDoc);
    expect(posComprador).toBeGreaterThan(posEmisor);
    expect(posTotales).toBeGreaterThan(posComprador);
  });

  it("orders IdDoc elements matching DGII schema: FechaLimitePago and TerminoPago BEFORE TablaFormasPago", () => {
    const xml = createUnsignedEcfXml(makeSnapshot({}), FIXED_NOW);
    const posTipoPago = xml.indexOf("<TipoPago>");
    const posFechaLimite = xml.indexOf("<FechaLimitePago>");
    const posTerminoPago = xml.indexOf("<TerminoPago>");
    const posTablaFormas = xml.indexOf("<TablaFormasPago>");

    expect(posTipoPago).toBeGreaterThan(-1);
    expect(posFechaLimite).toBeGreaterThan(posTipoPago);
    expect(posTerminoPago).toBeGreaterThan(posFechaLimite);
    expect(posTablaFormas).toBeGreaterThan(posTerminoPago);
  });

  it("formats Totales in correct schema order with MontoGravadoI1, TotalITBIS1, and 2-decimal strings", () => {
    const xml = createUnsignedEcfXml(makeSnapshot({}), FIXED_NOW);
    
    // Totales schema order: MontoGravadoTotal -> MontoGravadoI1 -> ITBIS1 -> TotalITBIS -> TotalITBIS1 -> MontoTotal
    expect(xml).toContain("<MontoGravadoTotal>100.00</MontoGravadoTotal>");
    expect(xml).toContain("<MontoGravadoI1>100.00</MontoGravadoI1>");
    expect(xml).toContain("<ITBIS1>18</ITBIS1>");
    expect(xml).toContain("<TotalITBIS>18.00</TotalITBIS>");
    expect(xml).toContain("<TotalITBIS1>18.00</TotalITBIS1>");
    expect(xml).toContain("<MontoTotal>118.00</MontoTotal>");

    // Must NOT contain invented or misplaced tags
    expect(xml).not.toContain("MontoGravadoI18");
    expect(xml).not.toContain("TotalITBIS18");

    const posGravadoTotal = xml.indexOf("<MontoGravadoTotal>100.00</MontoGravadoTotal>");
    const posGravadoI1 = xml.indexOf("<MontoGravadoI1>100.00</MontoGravadoI1>");
    const posItbis1 = xml.indexOf("<ITBIS1>18</ITBIS1>");
    const posTotalItbis = xml.indexOf("<TotalITBIS>18.00</TotalITBIS>");
    const posTotalItbis1 = xml.indexOf("<TotalITBIS1>18.00</TotalITBIS1>");
    const posMontoTotal = xml.indexOf("<MontoTotal>118.00</MontoTotal>");

    expect(posGravadoTotal).toBeGreaterThan(-1);
    expect(posGravadoI1).toBeGreaterThan(posGravadoTotal);
    expect(posItbis1).toBeGreaterThan(posGravadoI1);
    expect(posTotalItbis).toBeGreaterThan(posItbis1);
    expect(posTotalItbis1).toBeGreaterThan(posTotalItbis);
    expect(posMontoTotal).toBeGreaterThan(posTotalItbis1);
  });

  it("formats item prices, amounts and payments as 2-decimal strings and omits non-existent TablaImpuestos", () => {
    const xml = createUnsignedEcfXml(makeSnapshot({}), FIXED_NOW);

    expect(xml).toContain("<PrecioUnitarioItem>100.00</PrecioUnitarioItem>");
    expect(xml).toContain("<MontoItem>100.00</MontoItem>");
    expect(xml).toContain("<MontoPago>118.00</MontoPago>");
    
    // DGII e-CF has no TablaImpuestos on items
    expect(xml).not.toContain("<TablaImpuestos>");
    expect(xml).not.toContain("</TablaImpuestos>");
  });

  it("converts E32 full e-CF to RFCE preserving Version '1.0' and proper Totales order", () => {
    const e32Snapshot = makeSnapshot({
      factura: {
        ncf: "E320000000001",
        subtotal: 50,
        itbis: 9,
        total: 59,
      },
      items: [{ plato_id: 1, nombre: "Jugo Natural", cantidad: 1, precio_unitario: 50, subtotal: 50 }],
      payments: [{ payment_method: "efectivo", amount: 59 }],
    });

    const unsignedEcf = createUnsignedEcfXml(e32Snapshot, FIXED_NOW);
    expect(unsignedEcf).toContain("<TipoeCF>32</TipoeCF>");
    expect(unsignedEcf).toContain("<Version>1.0</Version>");

    // Mock a signature by adding a valid SignatureValue
    const signedEcf = unsignedEcf.replace(
      "</ECF>",
      "<Signature xmlns=\"http://www.w3.org/2000/09/xmldsig#\"><SignatureValue>ABC123xyz789</SignatureValue></Signature></ECF>"
    );

    const rfce = convertECF32ToRFCE(signedEcf);
    expect(rfce.securityCode).toBe("ABC123");
    expect(rfce.xml).toContain("<Version>1.0</Version>");
    expect(rfce.xml).not.toContain("<Version>1</Version>");
    expect(rfce.xml).toContain("<TipoeCF>32</TipoeCF>");
    expect(rfce.xml).toContain("<MontoGravadoTotal>50.00</MontoGravadoTotal>");
    expect(rfce.xml).toContain("<TotalITBIS>9.00</TotalITBIS>");
    expect(rfce.xml).toContain("<MontoTotal>59.00</MontoTotal>");
  });

  it("formats E34 credit note with IndicadorNotaCredito in IdDoc and InformacionReferencia in order", () => {
    const e34Snapshot = makeSnapshot({
      factura: {
        ncf: "E340000000001",
        ref_ncf: "E310000000007",
        ref_fecha_emision: "2026-10-10",
        ref_codigo_modificacion: 1,
        ref_razon_modificacion: "Devolucion",
      },
    });

    const xml = createUnsignedEcfXml(e34Snapshot, FIXED_NOW);
    expect(xml).toContain("<TipoeCF>34</TipoeCF>");
    expect(xml).toContain("<Version>1.0</Version>");
    expect(xml).toMatch(/<eNCF>E340000000001<\/eNCF>\s*<IndicadorNotaCredito>0<\/IndicadorNotaCredito>/);
    expect(xml).toContain("<NCFModificado>E310000000007</NCFModificado>");
    expect(xml).toContain("<FechaNCFModificado>10-10-2026</FechaNCFModificado>");
    expect(xml).toContain("<CodigoModificacion>1</CodigoModificacion>");
    expect(xml).toContain("<RazonModificacion>Devolucion</RazonModificacion>");
  });
});

describe("describeDgiiError helper", () => {
  it("extracts error message from standard Error instances", () => {
    expect(describeDgiiError(new Error("Network timeout connecting to DGII"))).toBe("Network timeout connecting to DGII");
  });

  it("extracts DGII rejection body { codigo, mensajes: [{codigo, valor}] } joining codigo and valor", () => {
    const dgiiBody = {
      codigo: 2,
      mensajes: [
        { codigo: "000", valor: "La estructura del archivo XML no es válido" },
        { codigo: "105", valor: "The Version element is invalid" },
      ],
    };

    const description = describeDgiiError(dgiiBody);
    expect(description).toContain("2");
    expect(description).toContain("000");
    expect(description).toContain("La estructura del archivo XML no es válido");
    expect(description).toContain("105");
    expect(description).toContain("The Version element is invalid");
  });

  it("extracts from axios error with response.data containing DGII error body", () => {
    const axiosError = {
      isAxiosError: true,
      message: "Request failed with status code 400",
      response: {
        status: 400,
        data: {
          codigo: 2,
          mensajes: [{ codigo: "000", valor: "Pattern constraint failed" }],
        },
      },
    };

    const description = describeDgiiError(axiosError);
    expect(description).toContain("Pattern constraint failed");
    expect(description).toContain("000");
  });

  it("returns raw string as is", () => {
    expect(describeDgiiError("Direct error string from DGII")).toBe("Direct error string from DGII");
  });

  it("serializes unknown object to JSON truncated to ~1000 chars", () => {
    const unknown = { custom_field: "unexpected", long_data: "a".repeat(2000) };
    const description = describeDgiiError(unknown);
    expect(description.length).toBeLessThanOrEqual(1005);
    expect(description).toContain("unexpected");
  });
});

describe("DGII error classification (terminal vs retryable)", () => {
  it("classifies DGII structural rejection (codigo 2 / XML no valido) as terminal", () => {
    const dgiiRejection = {
      codigo: 2,
      mensajes: [{ codigo: "000", valor: "La estructura del archivo XML no es válido" }],
    };

    expect(isDgiiTerminalError(dgiiRejection)).toBe(true);
  });

  it("classifies network errors, timeouts, and 5xx as retryable", () => {
    const networkError = new Error("connect ECONNREFUSED 10.0.0.1:443");
    expect(isDgiiTerminalError(networkError)).toBe(false);

    const serverError = {
      isAxiosError: true,
      message: "Server Error",
      response: { status: 503, data: "Service Unavailable" },
    };
    expect(isDgiiTerminalError(serverError)).toBe(false);
  });
});

describe("FiscalWorker error persistence", () => {
  it("writes error message to ecf_documents.last_error, dgii_status_message, and fiscal_outbox.error_message", async () => {
    const snapshot = makeSnapshot({});
    const updateDocumentMock = vi.fn().mockResolvedValue(undefined);
    const updateJobMock = vi.fn().mockResolvedValue(undefined);

    const mockRepo = {
      claimJob: vi.fn().mockResolvedValue({ kind: "claimed", snapshot }),
      findNextRunnableJob: vi.fn(),
      updateDocument: updateDocumentMock,
      updateJob: updateJobMock,
      recordAudit: vi.fn().mockResolvedValue(undefined),
    };

    const mockDgii = {
      submitSignedXml: vi.fn().mockResolvedValue({
        kind: "terminal_error",
        message: "DGII [2]: [000] La estructura del archivo XML no es válido",
      }),
      pollStatus: vi.fn(),
    };

    const mockCustody = {
      getSigningMaterial: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          certificateId: "cert-1",
          tenantId: "tenant-1",
          environment: "production",
          p12Bytes: new Uint8Array([1, 2, 3]),
          passphrase: "secret",
        },
      }),
    };

    const mockSigner = {
      signXml: vi.fn().mockResolvedValue({
        signedXml: "<ECF><RNCEmisor>130862346</RNCEmisor><eNCF>E310000000001</eNCF><Signature xmlns=\"http://www.w3.org/2000/09/xmldsig#\"><SignatureValue>12345678</SignatureValue></Signature></ECF>",
        storageKey: "storage-key",
      }),
    };

    const worker = new FiscalWorker({
      workerId: "worker-test",
      repository: mockRepo as any,
      dgii: mockDgii as any,
      custody: mockCustody as any,
      signer: mockSigner as any,
      now: () => FIXED_NOW,
    });

    const result = await worker.processJob(snapshot.job.id);

    expect(result.kind).toBe("failed");
    expect(result.retryable).toBe(false);

    expect(updateJobMock).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        status: "terminal_error",
        errorMessage: expect.stringContaining("La estructura del archivo XML no es válido"),
      })
    );

    expect(updateDocumentMock).toHaveBeenCalledWith(
      "doc-1",
      expect.objectContaining({
        status: "terminal_error",
        lastError: expect.stringContaining("La estructura del archivo XML no es válido"),
        dgiiStatusMessage: expect.stringContaining("La estructura del archivo XML no es válido"),
      })
    );
  });

  it("fails closed with terminal FISCAL_CONFIGURATION_INCOMPLETE when E31 is missing vence", async () => {
    const snapshot = makeSnapshot({
      factura: { ncf: "E310000000001" },
      tenant: {
        ecf_secuencias_rangos: {
          E31: { start: 1, end: 300 }, // missing vence
        },
      },
    });

    const updateDocumentMock = vi.fn().mockResolvedValue(undefined);
    const updateJobMock = vi.fn().mockResolvedValue(undefined);

    const mockRepo = {
      claimJob: vi.fn().mockResolvedValue({ kind: "claimed", snapshot }),
      updateDocument: updateDocumentMock,
      updateJob: updateJobMock,
      recordAudit: vi.fn().mockResolvedValue(undefined),
    };
    const mockDgii = { submitSignedXml: vi.fn(), pollStatus: vi.fn() };
    const mockCustody = {
      getSigningMaterial: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          certificateId: "cert-1",
          tenantId: "tenant-1",
          environment: "production",
          p12Bytes: new Uint8Array([1, 2, 3]),
          passphrase: "secret",
        },
      }),
    };
    const mockSigner = { signXml: vi.fn() };

    const worker = new FiscalWorker({
      workerId: "worker-test",
      repository: mockRepo as any,
      dgii: mockDgii as any,
      custody: mockCustody as any,
      signer: mockSigner as any,
      now: () => FIXED_NOW,
    });

    const result = await worker.processJob(snapshot.job.id);

    expect(result.kind).toBe("failed");
    expect(result.retryable).toBe(false);
    expect(result.code).toBe("FISCAL_CONFIGURATION_INCOMPLETE");

    expect(updateJobMock).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        status: "blocked_configuration",
        errorMessage: expect.stringContaining("E31"),
      })
    );
    expect(mockSigner.signXml).not.toHaveBeenCalled();
    expect(mockDgii.submitSignedXml).not.toHaveBeenCalled();
  });

  it("allows E32 RFCE below threshold to succeed without vence", async () => {
    const snapshot = makeSnapshot({
      factura: {
        ncf: "E320000000001",
        subtotal: 50,
        itbis: 9,
        total: 59,
      },
      items: [{ plato_id: 1, nombre: "Jugo", cantidad: 1, precio_unitario: 50, subtotal: 50 }],
      payments: [{ payment_method: "efectivo", amount: 59 }],
      tenant: {
        ecf_secuencias_rangos: {
          E32: { start: 1, end: 100 }, // no vence
        },
      },
    });

    const updateDocumentMock = vi.fn().mockResolvedValue(undefined);
    const updateJobMock = vi.fn().mockResolvedValue(undefined);

    const mockRepo = {
      claimJob: vi.fn().mockResolvedValue({ kind: "claimed", snapshot }),
      updateDocument: updateDocumentMock,
      updateJob: updateJobMock,
      recordAudit: vi.fn().mockResolvedValue(undefined),
      enqueueJob: vi.fn().mockResolvedValue(undefined),
    };
    const mockDgii = {
      submitSignedXml: vi.fn().mockResolvedValue({
        kind: "submitted",
        trackId: "track-rfce-123",
        statusCode: "1",
        rfceThresholdUsed: 250000,
      }),
      pollStatus: vi.fn(),
    };
    const mockCustody = {
      getSigningMaterial: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          certificateId: "cert-1",
          tenantId: "tenant-1",
          environment: "production",
          p12Bytes: new Uint8Array([1, 2, 3]),
          passphrase: "secret",
        },
      }),
    };
    const mockSigner = {
      signXml: vi.fn().mockResolvedValue({
        signedXml: "<ECF><Encabezado><IdDoc><TipoeCF>32</TipoeCF></IdDoc><Totales><MontoTotal>59.00</MontoTotal></Totales></Encabezado><Signature xmlns=\"http://www.w3.org/2000/09/xmldsig#\"><SignatureValue>123456</SignatureValue></Signature></ECF>",
      }),
    };

    const worker = new FiscalWorker({
      workerId: "worker-test",
      repository: mockRepo as any,
      dgii: mockDgii as any,
      custody: mockCustody as any,
      signer: mockSigner as any,
      now: () => FIXED_NOW,
    });

    const result = await worker.processJob(snapshot.job.id);

    expect(result.kind).toBe("processed");
    expect(result.status).toBe("submitted");
    expect(updateJobMock).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        status: "done",
      })
    );
  });

  it("E32 (full and RFCE) and E34 never emit FechaVencimientoSecuencia and never fail for missing vence", async () => {
    // E32 full (high amount) without any vence must succeed without FechaVencimientoSecuencia
    const e32FullXml = createUnsignedEcfXml(
      makeSnapshot({
        factura: { ncf: "E320000000001", subtotal: 260000, itbis: 46800, total: 306800 },
        items: [{ plato_id: 1, nombre: "Catering", cantidad: 1, precio_unitario: 260000, subtotal: 260000 }],
        payments: [{ payment_method: "efectivo", amount: 306800 }],
        tenant: { ecf_secuencias_rangos: { E32: { start: 1, end: 100 } } }, // no vence
      }),
      FIXED_NOW
    );
    expect(e32FullXml).not.toContain("<FechaVencimientoSecuencia>");

    // E32 RFCE (low amount) without any vence must also succeed without FechaVencimientoSecuencia
    const e32RfceXml = createUnsignedEcfXml(
      makeSnapshot({
        factura: { ncf: "E320000000001", subtotal: 50, itbis: 9, total: 59 },
        items: [{ plato_id: 1, nombre: "Jugo", cantidad: 1, precio_unitario: 50, subtotal: 50 }],
        payments: [{ payment_method: "efectivo", amount: 59 }],
        tenant: { ecf_secuencias_rangos: { E32: { start: 1, end: 100 } } }, // no vence
      }),
      FIXED_NOW
    );
    expect(e32RfceXml).not.toContain("<FechaVencimientoSecuencia>");

    // E34 credit note without any vence must succeed without FechaVencimientoSecuencia
    const e34Xml = createUnsignedEcfXml(
      makeSnapshot({
        factura: {
          ncf: "E340000000001",
          ref_ncf: "E310000000007",
          ref_fecha_emision: "2026-10-10",
          ref_codigo_modificacion: 1,
        },
        tenant: { ecf_secuencias_rangos: { E34: { start: 1, end: 100 } } }, // no vence
      }),
      FIXED_NOW
    );
    expect(e34Xml).not.toContain("<FechaVencimientoSecuencia>");
  });
});

describe("DGII Mapper Round 2 Rules (IndicadorFacturacion, DescuentoMonto, FechaVencimientoSecuencia)", () => {
  it("emits IndicadorFacturacion 1 for taxed 18% lines and 4 for exempt sale lines (never 0)", () => {
    // Taxed line:
    const taxedXml = createUnsignedEcfXml(
      makeSnapshot({
        factura: { subtotal: 100, itbis: 18, total: 118 },
        items: [{ plato_id: 1, nombre: "Item Taxed", cantidad: 1, precio_unitario: 100, subtotal: 100 }],
      }),
      FIXED_NOW
    );
    expect(taxedXml).toContain("<IndicadorFacturacion>1</IndicadorFacturacion>");
    expect(taxedXml).not.toContain("<IndicadorFacturacion>4</IndicadorFacturacion>");
    expect(taxedXml).not.toContain("<IndicadorFacturacion>0</IndicadorFacturacion>");

    // Exempt sale line (itbis = 0):
    const exemptXml = createUnsignedEcfXml(
      makeSnapshot({
        factura: { subtotal: 100, itbis: 0, total: 100 },
        items: [{ plato_id: 2, nombre: "Item Exempt", cantidad: 1, precio_unitario: 100, subtotal: 100 }],
        payments: [{ payment_method: "efectivo", amount: 100 }],
      }),
      FIXED_NOW
    );
    expect(exemptXml).toContain("<IndicadorFacturacion>4</IndicadorFacturacion>");
    expect(exemptXml).not.toContain("<IndicadorFacturacion>0</IndicadorFacturacion>");
    expect(exemptXml).not.toContain("<IndicadorFacturacion>1</IndicadorFacturacion>");
  });

  it("omits DescuentoMonto when discount is 0 and emits 2-decimal string when > 0", () => {
    // 0 discount:
    const noDiscountXml = createUnsignedEcfXml(
      makeSnapshot({
        items: [{ plato_id: 1, nombre: "Item", cantidad: 1, precio_unitario: 100, subtotal: 100, descuento: 0 }],
      }),
      FIXED_NOW
    );
    expect(noDiscountXml).not.toContain("<DescuentoMonto>");
    expect(noDiscountXml).not.toContain("</DescuentoMonto>");

    // > 0 discount:
    const discountXml = createUnsignedEcfXml(
      makeSnapshot({
        items: [{ plato_id: 1, nombre: "Item", cantidad: 1, precio_unitario: 100, subtotal: 100, descuento: 15.5 }],
      }),
      FIXED_NOW
    );
    expect(discountXml).toContain("<DescuentoMonto>15.50</DescuentoMonto>");
  });

  it("handles mixed items with taxed (1) and exempt (4) lines, and discount present only when > 0", () => {
    const mixedSnapshot = makeSnapshot({
      items: [
        { plato_id: 1, nombre: "Taxed Burger", cantidad: 2, precio_unitario: 100, subtotal: 200, itbis: 36, descuento: 0 },
        { plato_id: 2, nombre: "Exempt Water", cantidad: 1, precio_unitario: 50, subtotal: 50, itbis: 0, descuento: 5 },
      ],
      factura: { subtotal: 250, itbis: 36, total: 286 },
      payments: [{ payment_method: "tarjeta", amount: 286 }],
    });

    const xml = createUnsignedEcfXml(mixedSnapshot, FIXED_NOW);
    const itemMatches = [...xml.matchAll(/<Item>([\s\S]*?)<\/Item>/g)].map((m) => m[1]);
    expect(itemMatches).toHaveLength(2);

    // Item 1: taxed (18%), discount 0
    expect(itemMatches[0]).toContain("<IndicadorFacturacion>1</IndicadorFacturacion>");
    expect(itemMatches[0]).not.toContain("<DescuentoMonto>");

    // Item 2: untaxed/exempt (subtotal 50, itbis 0), discount 5
    // Note: since header itbis is 36 (18% of 200), item 1 has itbis 36 and item 2 has itbis 0
    expect(itemMatches[1]).toContain("<IndicadorFacturacion>4</IndicadorFacturacion>");
    expect(itemMatches[1]).toContain("<DescuentoMonto>5.00</DescuentoMonto>");
  });

  it("fails closed when vence has an invalid date or format (dd-MM-yyyy required)", () => {
    // Slashes instead of dashes
    expect(() =>
      createUnsignedEcfXml(
        makeSnapshot({
          factura: { ncf: "E310000000001" },
          tenant: { ecf_secuencias_rangos: { E31: { start: 1, end: 300, vence: "31/12/2027" } } },
        }),
        FIXED_NOW
      )
    ).toThrowError(/Sequence expiry date \(vence\) is (missing or )?invalid for E31/);

    // ISO format instead of dd-MM-yyyy
    expect(() =>
      createUnsignedEcfXml(
        makeSnapshot({
          factura: { ncf: "E310000000001" },
          tenant: { ecf_secuencias_rangos: { E31: { start: 1, end: 300, vence: "2027-12-31" } } },
        }),
        FIXED_NOW
      )
    ).toThrowError(/Sequence expiry date \(vence\) is (missing or )?invalid for E31/);

    // Invalid calendar day (Feb 31)
    expect(() =>
      createUnsignedEcfXml(
        makeSnapshot({
          factura: { ncf: "E310000000001" },
          tenant: { ecf_secuencias_rangos: { E31: { start: 1, end: 300, vence: "31-02-2027" } } },
        }),
        FIXED_NOW
      )
    ).toThrowError(/Sequence expiry date \(vence\) is (missing or )?invalid for E31/);
  });

  it("reads ecf_secuencias_rangos directly from snapshot.ecf_secuencias_rangos top-level", () => {
    const snapshot = makeSnapshot({
      factura: { ncf: "E310000000001" },
      tenant: { ecf_secuencias_rangos: undefined },
    });
    snapshot.ecf_secuencias_rangos = {
      E31: { start: 1, end: 300, vence: "15-08-2028" },
    };

    const xml = createUnsignedEcfXml(snapshot, FIXED_NOW);
    expect(xml).toContain("<FechaVencimientoSecuencia>15-08-2028</FechaVencimientoSecuencia>");
  });

  it("emits FechaVencimientoSecuencia for E31 from tenant ecf_secuencias_rangos and never for E34", () => {
    const e31Snapshot = makeSnapshot({
      factura: { ncf: "E310000000001" },
      tenant: {
        ecf_secuencias_rangos: {
          E31: { start: 1, end: 300, vence: "31-12-2027" },
          E34: { start: 1, end: 100, vence: "31-12-2027" },
        },
      },
    });
    const e31Xml = createUnsignedEcfXml(e31Snapshot, FIXED_NOW);
    expect(e31Xml).toContain("<FechaVencimientoSecuencia>31-12-2027</FechaVencimientoSecuencia>");

    const e34Snapshot = makeSnapshot({
      factura: {
        ncf: "E340000000001",
        ref_ncf: "E310000000007",
        ref_fecha_emision: "2026-10-10",
        ref_codigo_modificacion: 1,
        ref_razon_modificacion: "Devolucion",
      },
      tenant: {
        ecf_secuencias_rangos: {
          E31: { start: 1, end: 300, vence: "31-12-2027" },
          E34: { start: 1, end: 100, vence: "31-12-2027" },
        },
      },
    });
    const e34Xml = createUnsignedEcfXml(e34Snapshot, FIXED_NOW);
    expect(e34Xml).not.toContain("<FechaVencimientoSecuencia>");
  });
});
