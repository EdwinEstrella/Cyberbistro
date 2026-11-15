import { fiscalWorkerError } from "./errors";
import type { DgiiClientAdapter, XmlSignerAdapter, DgiiSubmitResult, DgiiPollResult } from "./types";
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

export const TRANSPORT_ERROR_CODES = [
  "ECONNABORTED",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ERR_NETWORK",
  "JOB_TIMEOUT",
] as const;

export const TRANSPORT_ERROR_CODE_REGEX = new RegExp(
  `^(?:${TRANSPORT_ERROR_CODES.join("|")})$`,
  "i"
);

export const TRANSPORT_ERROR_MESSAGE_REGEX =
  /timeout|socket hang up|network error|econnreset|econnrefused|enotfound|etimedout|eai_again|econnaborted/i;

export const DGII_SCHEMA_REJECTION_REGEX =
  /no es v[aá]lido|pattern constraint|schema|dtd|estructura|rechazad/i;

function hasDgiiTerminalMarkers(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;

  const rawData = (err as any).response?.data ?? err;
  if (rawData && typeof rawData === "object") {
    const data = rawData as Record<string, unknown>;
    const codigo = Number(data.codigo);
    if (codigo === 2) return true;

    const estado = String(data.estado || "").toLowerCase();
    if (estado.includes("rechazad")) return true;

    const mensajes = Array.isArray(data.mensajes)
      ? data.mensajes
      : Array.isArray(data.messages)
      ? data.messages
      : [];
    for (const m of mensajes) {
      const text = typeof m === "string" ? m : `${m?.codigo ?? ""} ${m?.valor ?? ""} ${m?.mensaje ?? ""}`;
      if (DGII_SCHEMA_REJECTION_REGEX.test(text)) {
        return true;
      }
    }
  }

  const message = String((err as any).message || "");
  if (DGII_SCHEMA_REJECTION_REGEX.test(message)) {
    return true;
  }

  return false;
}

export function isTransientTransportError(err: unknown): boolean {
  if (!err || (typeof err !== "object" && typeof err !== "string")) {
    return false;
  }

  if (typeof err === "object" && (err as any).retryable === false) {
    return false;
  }

  // DGII business rejections or XML schema failures are terminal business errors, never transient transport failures
  if (hasDgiiTerminalMarkers(err)) {
    return false;
  }

  if (typeof err === "object") {
    if ((err as any).transient === true) {
      return true;
    }

    const status = (err as any).response?.status ?? (err as any).status ?? (err as any).statusCode;
    if (typeof status === "number" && status >= 500 && status < 600) {
      return true;
    }
    if (typeof status === "string" && /^5\d{2}$/.test(status.trim())) {
      return true;
    }
    if (typeof status === "number" && status >= 400 && status < 500) {
      return false;
    }
    if (typeof status === "string" && /^4\d{2}$/.test(status.trim())) {
      return false;
    }

    const code = String((err as any).code || "");
    if (TRANSPORT_ERROR_CODE_REGEX.test(code)) {
      return true;
    }
  }

  const message = typeof err === "string" ? err : String((err as any).message || "");
  if (TRANSPORT_ERROR_MESSAGE_REGEX.test(message)) {
    return true;
  }

  if (typeof err === "object" && (err as any).cause) {
    return isTransientTransportError((err as any).cause);
  }

  return false;
}

export function isDgiiTerminalError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;

  if ((err as any).retryable === false) return true;

  // Transport errors, timeouts, network issues, and 5xx are retryable (never terminal)
  if (isTransientTransportError(err)) {
    return false;
  }

  if (hasDgiiTerminalMarkers(err)) {
    return true;
  }

  const status = (err as any).response?.status ?? (err as any).status;
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

export function normalizeDgiiMessages(mensajes: unknown): Array<{ code: string | null; text: string }> {
  if (!mensajes) return [];
  const list = Array.isArray(mensajes)
    ? mensajes
    : typeof mensajes === "object" || typeof mensajes === "string"
    ? [mensajes]
    : [];

  return list
    .map((m: any) => {
      if (!m) return null;
      if (typeof m === "string") {
        const text = m.trim();
        return text ? { code: null, text } : null;
      }
      if (typeof m === "object") {
        const code = m.codigo != null ? String(m.codigo).trim() || null : null;
        const text =
          m.valor != null
            ? String(m.valor).trim()
            : m.mensaje != null
            ? String(m.mensaje).trim()
            : "";
        return text ? { code, text } : null;
      }
      return null;
    })
    .filter((entry): entry is { code: string | null; text: string } => entry !== null);
}

export function formatMensajesDetail(mensajes: unknown): string {
  const normalized = normalizeDgiiMessages(mensajes);
  if (normalized.length === 0) return "";
  return normalized
    .map((m) => (m.code ? `[${m.code}] ${m.text}` : m.text))
    .join("; ");
}

export function isRfceDocument(params: {
  rfceThresholdUsed?: number | null;
  tipoeCF?: number | string | null;
  ncf?: string | null;
  total?: number | null;
  threshold?: number;
}): boolean {
  const isE32 =
    (params.tipoeCF != null && String(params.tipoeCF) === "32") ||
    (typeof params.ncf === "string" && params.ncf.trim().toUpperCase().startsWith("E32"));

  if (!isE32) {
    return false;
  }

  const threshold =
    params.threshold ??
    (params.rfceThresholdUsed != null ? Number(params.rfceThresholdUsed) : getE32RfceThreshold());
  const total = params.total != null ? Number(params.total) : 0;
  return total < threshold;
}

function mapRfceSummaryResponse(
  response: any,
  defaultTrackId: string | undefined,
  rfceThresholdUsed: number | null
): DgiiSubmitResult {
  const codigo = response?.codigo != null ? Number(response.codigo) : null;
  const trackId = response?.encf || defaultTrackId;
  const messages = normalizeDgiiMessages(response?.mensajes ?? response?.messages);
  const messagesProp = messages.length > 0 ? { messages } : {};

  if (codigo === 1) {
    return {
      kind: "accepted",
      trackId,
      statusCode: String(response.codigo),
      message: response.estado || "Aceptado",
      rfceThresholdUsed,
      ...messagesProp,
    };
  }

  if (codigo === 4) {
    const detail = formatMensajesDetail(response?.mensajes ?? response?.messages);
    const estado = response.estado || "Aceptado Condicional";
    return {
      kind: "accepted",
      trackId,
      statusCode: String(response.codigo),
      message: detail ? `${estado}: ${detail}` : estado,
      rfceThresholdUsed,
      ...messagesProp,
    };
  }

  if (codigo === 2) {
    return {
      kind: "rejected",
      trackId,
      statusCode: String(response.codigo),
      message: describeDgiiError(response),
      rfceThresholdUsed,
      ...messagesProp,
    };
  }

  if (codigo === 3) {
    return {
      kind: "submitted",
      trackId: trackId || "summary",
      statusCode: String(response.codigo),
      message: response.estado || "En proceso",
      rfceThresholdUsed,
      ...messagesProp,
    };
  }

  return {
    kind: "terminal_error",
    statusCode: codigo != null ? String(codigo) : undefined,
    message: describeDgiiError(response) || `DGII summary submission failed: ${JSON.stringify(response)}`,
    ...messagesProp,
  };
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

          const encf = getXmlTagValue(input.signedXml, "eNCF") || undefined;
          return mapRfceSummaryResponse(response, encf || `summary-${input.idempotencyKey}`, rfceThresholdUsed);
        } else {
          response = await ecf.sendElectronicDocument(input.signedXml, fileName);
        }
      } else {
        response = await ecf.sendElectronicDocument(input.signedXml, fileName);
      }

      if (response && response.trackId) {
        const messages = normalizeDgiiMessages(response.mensajes ?? response.messages);
        return {
          kind: "submitted",
          trackId: response.trackId,
          statusCode: "200",
          message: "Sent to DGII",
          rfceThresholdUsed,
          ...(messages.length > 0 ? { messages } : {}),
        };
      }

      return { kind: "terminal_error", message: describeDgiiError(response) || `No trackId returned: ${JSON.stringify(response)}` };
    } catch (err: any) {
      const message = describeDgiiError(err);
      if (err?.retryable === false || isDgiiTerminalError(err)) {
        return { kind: "terminal_error", message };
      }
      const transient = isTransientTransportError(err);
      return { kind: "retryable_error", message, transient };
    }
  }

  async pollStatus(input: Parameters<DgiiClientAdapter["pollStatus"]>[0]): Promise<DgiiPollResult> {
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

      if (input.isRfce) {
        const rncEmisor = input.rncEmisor;
        const encf = input.encf || input.trackId;
        const securityCode = input.securityCode;

        if (!rncEmisor || !encf || !securityCode) {
          throw fiscalWorkerError(
            "DGII_RFCE_POLL_DATA_MISSING",
            "Polling an RFCE document requires rncEmisor, encf, and securityCode.",
            false
          );
        }

        const response = await ecf.getSummaryInvoiceInquiry(rncEmisor, encf, securityCode);

        if (!response) {
          return { kind: "retryable_error", message: "Empty response from DGII RFCE summary inquiry" };
        }

        const codigo = response.codigo != null ? Number(response.codigo) : null;
        const messages = normalizeDgiiMessages(response.mensajes ?? response.messages);
        const messagesProp = messages.length > 0 ? { messages } : {};
        if (codigo === 1) {
          return {
            kind: "accepted",
            statusCode: String(response.codigo),
            message: response.estado || "Aceptado",
            ...messagesProp,
          };
        }
        if (codigo === 4) {
          const detail = formatMensajesDetail(response.mensajes ?? response.messages);
          const estado = response.estado || "Aceptado Condicional";
          return {
            kind: "accepted",
            statusCode: String(response.codigo),
            message: detail ? `${estado}: ${detail}` : estado,
            ...messagesProp,
          };
        }
        if (codigo === 2) {
          return {
            kind: "rejected",
            statusCode: String(response.codigo),
            message: describeDgiiError(response),
            ...messagesProp,
          };
        }
        if (codigo === 3) {
          return {
            kind: "retryable_error",
            statusCode: String(response.codigo),
            message: response.estado || "En proceso",
            ...messagesProp,
          };
        }
        return {
          kind: "terminal_error",
          statusCode: codigo != null ? String(codigo) : undefined,
          message: describeDgiiError(response) || `DGII RFCE inquiry failed: ${JSON.stringify(response)}`,
          ...messagesProp,
        };
      }

      const response = await ecf.statusTrackId(input.trackId);

      if (!response) {
        return { kind: "retryable_error", message: "Empty response from DGII status polling" };
      }

      const messages = normalizeDgiiMessages(response.mensajes ?? response.messages);
      const messagesProp = messages.length > 0 ? { messages } : {};
      const status = response.estado?.toLowerCase() || "";
      if (status.includes("aceptado")) {
        return { kind: "accepted", statusCode: response.codigo, message: response.estado, ...messagesProp };
      } else if (status.includes("rechazado")) {
        return { kind: "rejected", statusCode: response.codigo, message: describeDgiiError(response) || response.estado, ...messagesProp };
      } else {
        return { kind: "submitted", statusCode: response.codigo, message: response.estado, ...messagesProp };
      }
    } catch (err: any) {
      const message = describeDgiiError(err);
      if (err?.retryable === false || isDgiiTerminalError(err)) {
        return { kind: "terminal_error", message };
      }
      const transient = isTransientTransportError(err);
      return { kind: "retryable_error", message, transient };
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

      const encf = getXmlTagValue(input.signedXml, "eNCF") || undefined;
      return mapRfceSummaryResponse(response, encf, null);
    } catch (err: any) {
      const message = describeDgiiError(err);
      if (err?.retryable === false || isDgiiTerminalError(err)) {
        return { kind: "terminal_error", message };
      }
      const transient = isTransientTransportError(err);
      return { kind: "retryable_error", message, transient };
    }
  }
}
