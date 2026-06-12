import { fiscalWorkerError } from "./errors";
import type { DgiiClientAdapter, XmlSignerAdapter, DgiiSubmitResult } from "./types";
import ECF, { Signature, ENVIRONMENT, P12Reader, convertECF32ToRFCE as libConvertECF32ToRFCE } from "dgii-ecf";

export function convertECF32ToRFCE(ecf32Xml: string): { xml: string; securityCode: string } {
  return libConvertECF32ToRFCE(ecf32Xml);
}

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
  async submitSignedXml(input: Parameters<DgiiClientAdapter["submitSignedXml"]>[0]): Promise<DgiiSubmitResult> {
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

      const typeMatch = /<TipoeCF>(\d+)<\/TipoeCF>/.exec(input.signedXml);
      const isE32 = typeMatch && typeMatch[1] === "32";

      const totalMatch = /<MontoTotal>([^<]+)<\/MontoTotal>/.exec(input.signedXml);
      const total = totalMatch ? parseFloat(totalMatch[1]) : 0;

      const thresholdEnv = process.env.ECF_E32_RFCE_THRESHOLD_DOP;
      const threshold = thresholdEnv ? parseFloat(thresholdEnv) : 250000;

      let rfceThresholdUsed: number | null = null;
      let response: any;

      const fileName = `ECF_${input.idempotencyKey}.xml`;

      if (isE32) {
        rfceThresholdUsed = threshold;
        if (total < threshold) {
          const { xml: rfceXml } = convertECF32ToRFCE(input.signedXml);
          const signature = new Signature(certs.key, certs.cert);
          const signedRFCEXml = signature.signXml(rfceXml, "RFCE");
          
          response = await ecf.sendSummary(signedRFCEXml, fileName);

          if (response && (response.codigo === 1 || response.estado?.toLowerCase().includes("aceptado") || response.estado?.toLowerCase().includes("aceptada"))) {
            return {
              kind: "submitted",
              trackId: response.encf || `summary-${input.idempotencyKey}`,
              statusCode: String(response.codigo),
              message: response.estado,
              rfceThresholdUsed,
            };
          }

          return {
            kind: "terminal_error",
            statusCode: String(response?.codigo ?? ""),
            message: response?.estado || `DGII summary submission failed: ${JSON.stringify(response)}`,
          };
        } else {
          response = await ecf.sendElectronicDocument(input.signedXml, fileName);
        }
      } else {
        response = await ecf.sendElectronicDocument(input.signedXml, fileName);
      }

      if (response && response.trackId) {
        return {
          kind: "submitted",
          trackId: response.trackId,
          statusCode: "200",
          message: "Sent to DGII",
          rfceThresholdUsed,
        };
      }

      return { kind: "terminal_error", message: `No trackId returned: ${JSON.stringify(response)}` };
    } catch (err: any) {
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
