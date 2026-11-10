import { describe, expect, it, vi, beforeEach } from "vitest";
import { RealDgiiClient } from "../worker/fiscal/dgiiAdapters";

const mockAuthenticate = vi.fn();
const mockSendElectronicDocument = vi.fn();
const mockSendSummary = vi.fn();
const mockStatusTrackId = vi.fn();
const mockGetSummaryInvoiceInquiry = vi.fn();

const mockSignXml = vi.fn().mockImplementation((xml, type) => `<Signed_${type}>${xml}</Signed_${type}>`);
const mockGetKeyFromStringBase64 = vi.fn().mockReturnValue({ key: "mock-key", cert: "mock-cert" });

vi.mock("dgii-ecf", () => {
  const ecfConstructor = vi.fn().mockImplementation(() => {
    return {
      authenticate: mockAuthenticate,
      sendElectronicDocument: mockSendElectronicDocument,
      sendSummary: mockSendSummary,
      statusTrackId: mockStatusTrackId,
      getSummaryInvoiceInquiry: mockGetSummaryInvoiceInquiry,
    };
  });

  return {
    default: ecfConstructor,
    ECF: ecfConstructor,
    P12Reader: vi.fn().mockImplementation(() => {
      return {
        getKeyFromStringBase64: mockGetKeyFromStringBase64,
      };
    }),
    Signature: vi.fn().mockImplementation(() => {
      return {
        signXml: mockSignXml,
      };
    }),
    ENVIRONMENT: {
      DEV: "dev",
      CERT: "cert",
      PROD: "prod",
    },
    convertECF32ToRFCE: vi.fn().mockImplementation((xml) => {
      return {
        xml: `<RFCE>${xml}</RFCE>`,
        securityCode: "123456",
      };
    }),
  };
});

describe("RealDgiiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ECF_E32_RFCE_THRESHOLD_DOP;
  });

  const mockCertificate = {
    tenantId: "tenant-1",
    certificateId: "cert-1",
    environment: "certification" as const,
    p12Bytes: new Uint8Array([1, 2, 3]),
    passphrase: "password123",
  };

  it("routes E32 below threshold to sendSummary and returns accepted result for codigo 1 without DGII prefix", async () => {
    mockAuthenticate.mockResolvedValue({ token: "token" });
    mockSendSummary.mockResolvedValue({
      codigo: 1,
      estado: "Aceptado",
      encf: "E320000000001",
      secuenciaUtilizada: true,
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: "<ECF><RNCEmisor>131880738</RNCEmisor><eNCF>E3200000001</eNCF><TipoeCF>32</TipoeCF><MontoTotal>150000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-summary",
      certificate: mockCertificate,
    });

    expect(mockAuthenticate).toHaveBeenCalled();
    expect(mockSendSummary).toHaveBeenCalledWith(expect.any(String), "131880738E3200000001.xml");
    expect(mockSendElectronicDocument).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "accepted",
      trackId: "E320000000001",
      statusCode: "1",
      message: "Aceptado",
      rfceThresholdUsed: 250000,
    });
    expect(result).not.toHaveProperty("messages");
  });

  it("returns accepted result for RFCE codigo 4 with mensajes detail without DGII prefix", async () => {
    mockAuthenticate.mockResolvedValue({ token: "token" });
    mockSendSummary.mockResolvedValue({
      codigo: 4,
      estado: "Aceptado Condicional",
      encf: "E320000000001",
      secuenciaUtilizada: true,
      mensajes: [
        { codigo: 101, mensaje: "Advertencia de validacion" },
      ],
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: "<ECF><RNCEmisor>131880738</RNCEmisor><eNCF>E3200000001</eNCF><TipoeCF>32</TipoeCF><MontoTotal>150000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-summary-4",
      certificate: mockCertificate,
    });

    expect(result).toEqual({
      kind: "accepted",
      trackId: "E320000000001",
      statusCode: "4",
      message: "Aceptado Condicional: [101] Advertencia de validacion",
      rfceThresholdUsed: 250000,
      messages: [{ code: "101", text: "Advertencia de validacion" }],
    });
  });

  it("returns rejected terminal result for RFCE codigo 2 via describeDgiiError", async () => {
    mockAuthenticate.mockResolvedValue({ token: "token" });
    mockSendSummary.mockResolvedValue({
      codigo: 2,
      estado: "Rechazado",
      encf: "E320000000001",
      secuenciaUtilizada: false,
      mensajes: [
        { codigo: 31, valor: "RNC Comprador no existe" },
      ],
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: "<ECF><RNCEmisor>131880738</RNCEmisor><eNCF>E3200000001</eNCF><TipoeCF>32</TipoeCF><MontoTotal>150000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-summary-2",
      certificate: mockCertificate,
    });

    expect(result).toEqual({
      kind: "rejected",
      trackId: "E320000000001",
      statusCode: "2",
      message: "DGII [2] Rechazado: [31] RNC Comprador no existe",
      rfceThresholdUsed: 250000,
      messages: [{ code: "31", text: "RNC Comprador no existe" }],
    });
  });

  it("returns submitted result for RFCE codigo 3 to trigger poll", async () => {
    mockAuthenticate.mockResolvedValue({ token: "token" });
    mockSendSummary.mockResolvedValue({
      codigo: 3,
      estado: "En proceso",
      encf: "E320000000001",
      secuenciaUtilizada: false,
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: "<ECF><RNCEmisor>131880738</RNCEmisor><eNCF>E3200000001</eNCF><TipoeCF>32</TipoeCF><MontoTotal>150000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-summary-3",
      certificate: mockCertificate,
    });

    expect(result).toEqual({
      kind: "submitted",
      trackId: "E320000000001",
      statusCode: "3",
      message: "En proceso",
      rfceThresholdUsed: 250000,
    });
  });

  it("returns terminal_error for unexpected RFCE summary code", async () => {
    mockAuthenticate.mockResolvedValue({ token: "token" });
    mockSendSummary.mockResolvedValue({
      codigo: 0,
      estado: "No encontrado",
      encf: "E320000000001",
      secuenciaUtilizada: false,
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: "<ECF><RNCEmisor>131880738</RNCEmisor><eNCF>E3200000001</eNCF><TipoeCF>32</TipoeCF><MontoTotal>150000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-summary-0",
      certificate: mockCertificate,
    });

    expect(result.kind).toBe("terminal_error");
    expect(result.statusCode).toBe("0");
  });

  it("routes E32 equal to threshold to sendElectronicDocument", async () => {
    mockAuthenticate.mockResolvedValue({ token: "token" });
    mockSendElectronicDocument.mockResolvedValue({
      trackId: "track-1234",
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: "<ECF><RNCEmisor>131880738</RNCEmisor><eNCF>E3200000002</eNCF><TipoeCF>32</TipoeCF><MontoTotal>250000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-above",
      certificate: mockCertificate,
    });

    expect(mockAuthenticate).toHaveBeenCalled();
    expect(mockSendElectronicDocument).toHaveBeenCalledWith(expect.any(String), "131880738E3200000002.xml");
    expect(mockSendSummary).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "submitted",
      trackId: "track-1234",
      statusCode: "200",
      message: "Sent to DGII",
      rfceThresholdUsed: 250000,
    });
  });

  it("uses custom threshold from env variable", async () => {
    process.env.ECF_E32_RFCE_THRESHOLD_DOP = "50000";
    mockAuthenticate.mockResolvedValue({ token: "token" });
    mockSendElectronicDocument.mockResolvedValue({
      trackId: "track-50000",
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: "<ECF><RNCEmisor>131880738</RNCEmisor><eNCF>E3200000003</eNCF><TipoeCF>32</TipoeCF><MontoTotal>60000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-env",
      certificate: mockCertificate,
    });

    expect(mockSendElectronicDocument).toHaveBeenCalledWith(expect.any(String), "131880738E3200000003.xml");
    expect(mockSendSummary).not.toHaveBeenCalled();
    expect(result.rfceThresholdUsed).toBe(50000);
  });

  it("routes non-E32 to sendElectronicDocument regardless of total", async () => {
    mockAuthenticate.mockResolvedValue({ token: "token" });
    mockSendElectronicDocument.mockResolvedValue({
      trackId: "track-e31",
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: "<ECF><RNCEmisor>131880738</RNCEmisor><eNCF>E3100000001</eNCF><TipoeCF>31</TipoeCF><MontoTotal>1000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-e31",
      certificate: mockCertificate,
    });

    expect(mockSendElectronicDocument).toHaveBeenCalledWith(expect.any(String), "131880738E3100000001.xml");
    expect(mockSendSummary).not.toHaveBeenCalled();
    expect(result.rfceThresholdUsed).toBeNull();
  });

  it("sends an E34 credit note as a full e-CF even when it is under the RFCE threshold", async () => {
    mockAuthenticate.mockResolvedValue({ token: "token" });
    mockSendElectronicDocument.mockResolvedValue({ trackId: "track-e34" });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: "<ECF><RNCEmisor>131880738</RNCEmisor><eNCF>E340000000001</eNCF><TipoeCF>34</TipoeCF><MontoTotal>100</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-e34",
      certificate: mockCertificate,
    });

    expect(mockSendElectronicDocument).toHaveBeenCalledWith(expect.any(String), "131880738E340000000001.xml");
    expect(mockSendSummary).not.toHaveBeenCalled();
    expect(result.rfceThresholdUsed).toBeNull();
  });

  it("fails closed when signed XML cannot provide the DGII file name data", async () => {
    mockAuthenticate.mockResolvedValue({ token: "token" });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: "<ECF><TipoeCF>31</TipoeCF><MontoTotal>1000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-missing-file-data",
      certificate: mockCertificate,
    });

    expect(mockSendElectronicDocument).not.toHaveBeenCalled();
    expect(mockSendSummary).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      kind: "terminal_error",
      message: expect.stringContaining("RNCEmisor and eNCF"),
    });
  });

  describe("pollStatus", () => {
    it("polls full e-CF via statusTrackId when isRfce is false or omitted", async () => {
      mockAuthenticate.mockResolvedValue({ token: "token" });
      mockStatusTrackId.mockResolvedValue({
        trackId: "track-123",
        codigo: 1,
        estado: "Aceptado",
      });

      const client = new RealDgiiClient();
      const result = await client.pollStatus({
        trackId: "track-123",
        environment: "certification",
        idempotencyKey: "poll-key",
        certificate: mockCertificate,
      });

      expect(mockAuthenticate).toHaveBeenCalled();
      expect(mockStatusTrackId).toHaveBeenCalledWith("track-123");
      expect(mockGetSummaryInvoiceInquiry).not.toHaveBeenCalled();
      expect(result).toEqual({
        kind: "accepted",
        statusCode: 1,
        message: "Aceptado",
      });
    });

    it("polls RFCE via getSummaryInvoiceInquiry with rnc, encf, and securityCode", async () => {
      mockAuthenticate.mockResolvedValue({ token: "token" });
      mockGetSummaryInvoiceInquiry.mockResolvedValue({
        rnc: "131880738",
        encf: "E320000000001",
        codigo: 1,
        estado: "Aceptado",
        secuenciaUtilizada: true,
      });

      const client = new RealDgiiClient();
      const result = await client.pollStatus({
        trackId: "E320000000001",
        environment: "certification",
        idempotencyKey: "poll-rfce-key",
        certificate: mockCertificate,
        isRfce: true,
        rncEmisor: "131880738",
        encf: "E320000000001",
        securityCode: "SEC123",
      });

      expect(mockAuthenticate).toHaveBeenCalled();
      expect(mockGetSummaryInvoiceInquiry).toHaveBeenCalledWith("131880738", "E320000000001", "SEC123");
      expect(mockStatusTrackId).not.toHaveBeenCalled();
      expect(result).toEqual({
        kind: "accepted",
        statusCode: "1",
        message: "Aceptado",
      });
      expect(result).not.toHaveProperty("messages");
    });

    it("maps RFCE inquiry codigo 4 to accepted with detail", async () => {
      mockAuthenticate.mockResolvedValue({ token: "token" });
      mockGetSummaryInvoiceInquiry.mockResolvedValue({
        rnc: "131880738",
        encf: "E320000000001",
        codigo: 4,
        estado: "Aceptado Condicional",
        mensajes: [{ codigo: 200, mensaje: "Aviso de recepcion" }],
      });

      const client = new RealDgiiClient();
      const result = await client.pollStatus({
        trackId: "E320000000001",
        environment: "certification",
        idempotencyKey: "poll-rfce-4",
        certificate: mockCertificate,
        isRfce: true,
        rncEmisor: "131880738",
        encf: "E320000000001",
        securityCode: "SEC123",
      });

      expect(result).toEqual({
        kind: "accepted",
        statusCode: "4",
        message: "Aceptado Condicional: [200] Aviso de recepcion",
        messages: [{ code: "200", text: "Aviso de recepcion" }],
      });
    });

    it("maps RFCE inquiry codigo 2 to rejected terminal", async () => {
      mockAuthenticate.mockResolvedValue({ token: "token" });
      mockGetSummaryInvoiceInquiry.mockResolvedValue({
        rnc: "131880738",
        encf: "E320000000001",
        codigo: 2,
        estado: "Rechazado",
        mensajes: [{ codigo: 99, mensaje: "Comprobante rechazado" }],
      });

      const client = new RealDgiiClient();
      const result = await client.pollStatus({
        trackId: "E320000000001",
        environment: "certification",
        idempotencyKey: "poll-rfce-2",
        certificate: mockCertificate,
        isRfce: true,
        rncEmisor: "131880738",
        encf: "E320000000001",
        securityCode: "SEC123",
      });

      expect(result).toEqual({
        kind: "rejected",
        statusCode: "2",
        message: "DGII [2] Rechazado: [99] Comprobante rechazado",
        messages: [{ code: "99", text: "Comprobante rechazado" }],
      });
    });

    it("maps RFCE inquiry codigo 3 to retryable_error with backoff", async () => {
      mockAuthenticate.mockResolvedValue({ token: "token" });
      mockGetSummaryInvoiceInquiry.mockResolvedValue({
        rnc: "131880738",
        encf: "E320000000001",
        codigo: 3,
        estado: "En proceso",
      });

      const client = new RealDgiiClient();
      const result = await client.pollStatus({
        trackId: "E320000000001",
        environment: "certification",
        idempotencyKey: "poll-rfce-3",
        certificate: mockCertificate,
        isRfce: true,
        rncEmisor: "131880738",
        encf: "E320000000001",
        securityCode: "SEC123",
      });

      expect(result).toEqual({
        kind: "retryable_error",
        statusCode: "3",
        message: "En proceso",
      });
    });

    it("maps RFCE inquiry codigo 0 or unexpected to terminal_error", async () => {
      mockAuthenticate.mockResolvedValue({ token: "token" });
      mockGetSummaryInvoiceInquiry.mockResolvedValue({
        rnc: "131880738",
        encf: "E320000000001",
        codigo: 0,
        estado: "No encontrado",
      });

      const client = new RealDgiiClient();
      const result = await client.pollStatus({
        trackId: "E320000000001",
        environment: "certification",
        idempotencyKey: "poll-rfce-0",
        certificate: mockCertificate,
        isRfce: true,
        rncEmisor: "131880738",
        encf: "E320000000001",
        securityCode: "SEC123",
      });

      expect(result.kind).toBe("terminal_error");
    });
  });
});
