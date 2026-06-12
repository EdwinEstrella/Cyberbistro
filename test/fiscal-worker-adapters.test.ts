import { describe, expect, it } from "vitest";
import { FailClosedDgiiClient, FailClosedXmlSigner, RealDgiiClient } from "../worker/fiscal/dgiiAdapters";

describe("fail-closed DGII adapters", () => {
  it("refuses XML signing when the real signer is not configured", async () => {
    const signer = new FailClosedXmlSigner();

    await expect(
      signer.signXml({
        unsignedXml: "<ECF />",
        environment: "certification",
        certificate: {
          certificateId: "cert-1",
          tenantId: "tenant-1",
          environment: "certification",
          p12Bytes: new Uint8Array([1]),
          passphrase: "secret",
        },
      })
    ).rejects.toMatchObject({ code: "XML_SIGNER_NOT_CONFIGURED", retryable: false });
  });

  it("refuses to fake DGII submission or polling when the client is not configured", async () => {
    const dgii = new FailClosedDgiiClient();

    await expect(
      dgii.submitSignedXml({ signedXml: "<Signed />", environment: "certification", idempotencyKey: "key-1" })
    ).rejects.toMatchObject({ code: "DGII_CLIENT_NOT_CONFIGURED", retryable: true });

    await expect(
      dgii.pollStatus({ trackId: "TRK-1", environment: "certification", idempotencyKey: "key-2" })
    ).rejects.toMatchObject({ code: "DGII_CLIENT_NOT_CONFIGURED", retryable: true });
  });
});

describe("RealDgiiClient DGII file naming", () => {
  it("fails closed when the signed XML is missing RNCEmisor/eNCF for the required file name", async () => {
    const dgii = new RealDgiiClient();

    const result = await dgii.submitSignedXml({
      signedXml: "<ECF><TipoeCF>31</TipoeCF><MontoTotal>1000</MontoTotal></ECF>",
      environment: "certification",
      idempotencyKey: "key-missing-filename-data",
      certificate: {
        certificateId: "cert-1",
        tenantId: "tenant-1",
        environment: "certification",
        p12Bytes: new Uint8Array([1]),
        passphrase: "secret",
      },
    });

    expect(result).toMatchObject({
      kind: "terminal_error",
      message: expect.stringContaining("RNCEmisor and eNCF"),
    });
  });
});
