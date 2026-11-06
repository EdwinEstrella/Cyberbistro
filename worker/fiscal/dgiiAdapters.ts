import { fiscalWorkerError } from "./errors";
import type { DgiiClientAdapter, XmlSignerAdapter, DgiiSubmitResult } from "./types";
import { ECF, Signature, ENVIRONMENT, P12Reader, convertECF32ToRFCE as libConvertECF32ToRFCE } from "dgii-ecf";

export function describeDgiiError(err: unknown): string {
  if (err === null || err === undefined) {
    return "Unknown DGII error";
  }

  if (typeof err === "string") {
    return err.trim().slice(0, 1000) || "Unknown DGII error";
  }

  const rawData = (err as any)?.response?.data ?? err;

  if (rawData && typeof rawData === "object") {
    const data = rawData as Record<string, unknown>;
    const codigo = data.codigo != null ? String(data.codigo) : null;
    const estado = typeof data.estado === "string" ? data.estado.trim() : null;

    let messageList: string[] = [];
    if (Array.isArray(data.mensajes)) {
      messageList = data.mensajes
        .map((m: any) => {
          if (!m) return "";
          if (typeof m === "string") return m.trim();
          const cod = m.codigo != null ? `[${m.codigo}] ` : "";
          const val = m.valor != null ? String(m.valor).trim() : (m.mensaje != null ? String(m.mensaje).trim() : "");
          return `${cod}${val}`.trim();
        })
        .filter(Boolean);
    } else if (Array.isArray(data.messages)) {
      messageList = data.messages
        .map((m: any) => {
          if (!m) return "";
          if (typeof m === "string") return m.trim();
          const cod = m.codigo != null ? `[${m.codigo}] ` : "";
          const val = m.valor != null ? String(m.valor).trim() : (m.mensaje != null ? String(m.mensaje).trim() : "");
          return `${cod}${val}`.trim();
        })
        .filter(Boolean);
    }

    if (messageList.length > 0) {
      const joined = messageList.join("; ");
      if (codigo && !joined.includes(`[${codigo}]`)) {
        return `DGII [${codigo}]${estado ? ` ${estado}` : ""}: ${joined}`.slice(0, 1000);
      }
      return `${estado ? `${estado}: ` : ""}${joined}`.slice(0, 1000);
    }

    if (estado) {
      return (codigo ? `DGII [${codigo}] ${estado}` : estado).slice(0, 1000);
    }

    if (typeof data.message === "string" && data.message.trim()) {
      return (codigo ? `DGII [${codigo}] ${data.message.trim()}` : data.message.trim()).slice(0, 1000);
    }
    if (typeof data.error === "string" && data.error.trim()) {
      return (codigo ? `DGII [${codigo}] ${data.error.trim()}` : data.error.trim()).slice(0, 1000);
    }
    if (typeof data.title === "string" && data.title.trim()) {
      return (codigo ? `DGII [${codigo}] ${data.title.trim()}` : data.title.trim()).slice(0, 1000);
    }
  }

  if (err instanceof Error && err.message?.trim()) {
    return err.message.trim().slice(0, 1000);
  }

  try {
    return JSON.stringify(err).slice(0, 1000);
  } catch {
    return String(err).slice(0, 1000);
  }
}

export function isDgiiTerminalError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;

  if ((err as any).retryable === false) return true;

  // Network errors, timeouts, and 5xx are retryable
  const status = (err as any).response?.status;
  if (typeof status === "number" && status >= 500) return false;

  const code = String((err as any).code || "");
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ERR_NETWORK/i.test(code)) {
    return false;
  }

  const message = String((err as any).message || "");
  if (/timeout|network error|econnrefused/i.test(message)) {
    return false;
  }

  const rawData = (err as any).response?.data ?? err;
  if (rawData && typeof rawData === "object") {
    const data = rawData as Record<string, unknown>;
    const codigo = Number(data.codigo);
    // DGII Codigo 2: Rechazado
    if (codigo === 2) return true;

    const estado = String(data.estado || "").toLowerCase();
    if (estado.includes("rechazad")) return true;

    const mensajes = Array.isArray(data.mensajes) ? data.mensajes : (Array.isArray(data.messages) ? data.messages : []);
    for (const m of mensajes) {
      const text = typeof m === "string" ? m : `${m?.codigo ?? ""} ${m?.valor ?? ""} ${m?.mensaje ?? ""}`;
      if (/no es v[aá]lido|pattern constraint|schema|dtd|estructura|rechazad/i.test(text)) {
        return true;
      }
    }
  }

  if (status === 400 || status === 422) return true;

  return false;
}

export function getE32RfceThreshold(): number {
  const thresholdEnv = process.env.ECF_E32_RFCE_THRESHOLD_DOP;
  return thresholdEnv ? parseFloat(thresholdEnv) : 250000;
}

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
      throw fiscalWorkerError("SIGN_ERROR", `Failed to sign XML: ${describeDgiiError(err)}`, false);
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

function getXmlTagValue(xml: string, tagName: string): string | null {
  const match = new RegExp(`<${tagName}>([^<]+)</${tagName}>`).exec(xml);
  return match?.[1]?.trim() || null;
}

function createDgiiFileName(signedXml: string): string {
  const rnc = getXmlTagValue(signedXml, "RNCEmisor");
  const encf = getXmlTagValue(signedXml, "eNCF");

  if (!rnc || !encf) {
    throw fiscalWorkerError(
      "DGII_FILENAME_DATA_MISSING",
      "Signed XML must include RNCEmisor and eNCF to build the DGII file name.",
      false
    );
  }

  return `${rnc}${encf}.xml`;
}

export class RealDgiiClient implements DgiiClientAdapter {
  async submitSignedXml(input: Parameters<DgiiClientAdapter["submitSignedXml"]>[0]): Promise<DgiiSubmitResult> {
    try {
      const fileName = createDgiiFileName(input.signedXml);
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

      const threshold = getE32RfceThreshold();

      let rfceThresholdUsed: number | null = null;
      let response: any;

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
            message: describeDgiiError(response) || `DGII summary submission failed: ${JSON.stringify(response)}`,
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

      return { kind: "terminal_error", message: describeDgiiError(response) || `No trackId returned: ${JSON.stringify(response)}` };
    } catch (err: any) {
      const message = describeDgiiError(err);
      if (err?.retryable === false || isDgiiTerminalError(err)) {
        return { kind: "terminal_error", message };
      }
      return { kind: "retryable_error", message };
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
        return { kind: "rejected", statusCode: response.codigo, message: describeDgiiError(response) || response.estado };
      } else {
        return { kind: "submitted", statusCode: response.codigo, message: response.estado };
      }
    } catch (err: any) {
      const message = describeDgiiError(err);
      if (err?.retryable === false || isDgiiTerminalError(err)) {
        return { kind: "terminal_error", message };
      }
      return { kind: "retryable_error", message };
    }
  }

  async sendSummary(input: Parameters<DgiiClientAdapter["sendSummary"]>[0]): Promise<DgiiSubmitResult> {
    try {
      const p12Base64 = Buffer.from(input.certificate.p12Bytes).toString("base64");
      const reader = new P12Reader(input.certificate.passphrase);
      const certs = reader.getKeyFromStringBase64(p12Base64);

      if (!certs.key || !certs.cert) {
        throw fiscalWorkerError("SIGN_ERROR", "Invalid certificate extracting keys for sendSummary", false);
      }

      const env = getDgiiEnvironment(input.environment);
      const ecf = new ECF(certs, env);
      await ecf.authenticate();

      const response = await ecf.sendSummary(input.signedXml, input.fileName);

      if (response && response.trackId) {
        return { kind: "submitted", trackId: response.trackId, statusCode: "200", message: "Sent RFCE summary to DGII" };
      }

      return { kind: "terminal_error", message: describeDgiiError(response) || `No trackId returned for summary: ${JSON.stringify(response)}` };
    } catch (err: any) {
      const message = describeDgiiError(err);
      if (err?.retryable === false || isDgiiTerminalError(err)) {
        return { kind: "terminal_error", message };
      }
      return { kind: "retryable_error", message };
    }
  }
}
