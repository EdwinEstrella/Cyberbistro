import { fiscalWorkerError } from "./errors";
import type { DgiiClientAdapter, XmlSignerAdapter } from "./types";
import ECF, { Signature, ENVIRONMENT, P12Reader } from "dgii-ecf";

export class FailClosedXmlSigner implements XmlSignerAdapter {
  async signXml(): Promise<any> {
    throw fiscalWorkerError("XML_SIGNER_NOT_CONFIGURED", "No valid XML Signer configuration found.", false);
  }
}

export class FailClosedDgiiClient implements DgiiClientAdapter {
  async submitSignedXml(): Promise<any> {
    throw fiscalWorkerError("DGII_CLIENT_NOT_CONFIGURED", "No valid DGII client configuration found.", true);
  }
  async pollStatus(): Promise<any> {
    throw fiscalWorkerError("DGII_CLIENT_NOT_CONFIGURED", "No valid DGII client configuration found.", true);
  }
}

export class RealXmlSigner implements XmlSignerAdapter {
  async signXml(input: Parameters<XmlSignerAdapter["signXml"]>[0]) {
    try {
      const p12Base64 = Buffer.from(input.certificate.p12Bytes).toString("base64");
      const reader = new P12Reader(input.certificate.passphrase);
      const certs = reader.getKeyFromStringBase64(p12Base64);

      if (!certs.key || !certs.cert) {
        throw fiscalWorkerError("SIGN_ERROR", "Invalid certificate extracting keys", false);
      }

      const signature = new Signature(certs.key, certs.cert);
      const signedXml = signature.signXml(input.unsignedXml);

      return { signedXml };
    } catch (err: any) {
      throw fiscalWorkerError("SIGN_ERROR", `Failed to sign XML: ${err.message}`, false);
    }
  }
}

function getDgiiEnvironment(env: string) {
  switch (env) {
    case "test": return ENVIRONMENT.DEV; // dgii-ecf uses DEV for testing

    case "certification": return ENVIRONMENT.CERT;
    case "production": return ENVIRONMENT.PROD;
    default: return ENVIRONMENT.DEV;
  }
}

export class RealDgiiClient implements DgiiClientAdapter {
  async submitSignedXml(input: Parameters<DgiiClientAdapter["submitSignedXml"]>[0]): Promise<any> {
    try {
      const p12Base64 = Buffer.from(input.certificate.p12Bytes).toString("base64");
      const reader = new P12Reader(input.certificate.passphrase);
      const certs = reader.getKeyFromStringBase64(p12Base64);

      if (!certs.key || !certs.cert) {
        throw fiscalWorkerError("SIGN_ERROR", "Invalid certificate extracting keys for DgiiClient", false);
      }

      const env = getDgiiEnvironment(input.environment);
      const ecf = new ECF(certs, env);
      await ecf.authenticate();

      // We need a proper filename, but it is not strictly required to be exact if the DGII accepts it,
      // but let's use a dummy name like 'invoice.xml' since dgii-ecf uses it for the multipart form.
      const response = await ecf.sendElectronicDocument(input.signedXml, `ECF_${input.idempotencyKey}.xml`);

      if (response && response.trackId) {
        return { kind: "submitted", trackId: response.trackId, statusCode: "200", message: "Sent to DGII" };
      }

      return { kind: "terminal_error", message: `No trackId returned: ${JSON.stringify(response)}` };
    } catch (err: any) {
      // Analyze error if it's retryable
      return { kind: "retryable_error", message: err.message };
    }
  }

  async pollStatus(input: Parameters<DgiiClientAdapter["pollStatus"]>[0]): Promise<any> {
    try {
      const p12Base64 = Buffer.from(input.certificate.p12Bytes).toString("base64");
      const reader = new P12Reader(input.certificate.passphrase);
      const certs = reader.getKeyFromStringBase64(p12Base64);

      if (!certs.key || !certs.cert) {
        throw fiscalWorkerError("SIGN_ERROR", "Invalid certificate extracting keys for pollStatus", false);
      }

      const env = getDgiiEnvironment(input.environment);
      const ecf = new ECF(certs, env);
      await ecf.authenticate();

      const response = await ecf.statusTrackId(input.trackId);

      if (!response) {
        return { kind: "retryable_error", message: "Empty response from DGII status polling" };
      }

      const status = response.estado?.toLowerCase() || "";
      if (status.includes("aceptado")) {
        return { kind: "accepted", statusCode: response.codigo, message: response.estado };
      } else if (status.includes("rechazado")) {
        return { kind: "rejected", statusCode: response.codigo, message: response.estado };
      } else {
        return { kind: "submitted", statusCode: response.codigo, message: response.estado };
      }
    } catch (err: any) {
      return { kind: "retryable_error", message: err.message };
    }
  }
}
