import { describe, expect, it, vi, beforeEach } from "vitest";
import { RealDgiiClient } from "./dgiiAdapters";

const mockAuthenticate = vi.fn();
const mockSendElectronicDocument = vi.fn();
const mockSendSummary = vi.fn();
const mockStatusTrackId = vi.fn();

const mockSignXml = vi.fn().mockImplementation((xml, type) => `<Signed_${type}>${xml}</Signed_${type}>`);
const mockGetKeyFromStringBase64 = vi.fn().mockReturnValue({ key: "mock-key", cert: "mock-cert" });

vi.mock("dgii-ecf", () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return {
        authenticate: mockAuthenticate,
        sendElectronicDocument: mockSendElectronicDocument,
        sendSummary: mockSendSummary,
        statusTrackId: mockStatusTrackId,
      };
    }),
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

  it("routes E32 below threshold to sendSummary and returns synchronized result", async () => {
    mockAuthenticate.mockResolvedValue({ token: "token" });
    mockSendSummary.mockResolvedValue({
      codigo: 1,
      estado: "Aceptado",
      encf: "E3200000001",
      secuenciaUtilizada: true,
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: "<ECF><TipoeCF>32</TipoeCF><MontoTotal>150000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-summary",
      certificate: mockCertificate,
    });

    expect(mockAuthenticate).toHaveBeenCalled();
    expect(mockSendSummary).toHaveBeenCalled();
    expect(mockSendElectronicDocument).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "submitted",
      trackId: "E3200000001",
      statusCode: "1",
      message: "Aceptado",
      rfceThresholdUsed: 250000,
    });
  });

  it("routes E32 equal to threshold to sendElectronicDocument", async () => {
    mockAuthenticate.mockResolvedValue({ token: "token" });
    mockSendElectronicDocument.mockResolvedValue({
      trackId: "track-1234",
    });

    const client = new RealDgiiClient();
    const result = await client.submitSignedXml({
      signedXml: "<ECF><TipoeCF>32</TipoeCF><MontoTotal>250000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-above",
      certificate: mockCertificate,
    });

    expect(mockAuthenticate).toHaveBeenCalled();
    expect(mockSendElectronicDocument).toHaveBeenCalled();
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
      signedXml: "<ECF><TipoeCF>32</TipoeCF><MontoTotal>60000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-env",
      certificate: mockCertificate,
    });

    expect(mockSendElectronicDocument).toHaveBeenCalled();
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
      signedXml: "<ECF><TipoeCF>31</TipoeCF><MontoTotal>1000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "test-key-e31",
      certificate: mockCertificate,
    });

    expect(mockSendElectronicDocument).toHaveBeenCalled();
    expect(mockSendSummary).not.toHaveBeenCalled();
    expect(result.rfceThresholdUsed).toBeNull();
  });
});
