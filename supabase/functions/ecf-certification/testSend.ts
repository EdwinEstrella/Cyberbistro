// send-test / test-status: one E31 (Factura de Crédito Fiscal) built from the tenant's own issuer
// data, signed with its TesteCF certificate and sent to DGII TesteCF, so an admin can check the
// certificate, data and authentication end to end before production. Only ever talks to the "test"
// environment: the environment is hard-coded below and the request must say "test" explicitly.
// Never logs or returns XML, certificates or DGII tokens.
import { escapeXml, formatDgiiDateTime, securityCodeFromSignedXml, stampSignatureTime } from "./builder.ts";
import { HttpError, json, loadSigner, type ActionContext } from "./context.ts";
import type { DgiiEnvironment } from "./dgiiClient.ts";
import { DgiiError } from "./dgiiClient.ts";

const TEST_ENVIRONMENT: DgiiEnvironment = "test";

/**
 * Default buyer: the RNC the DGII test-set samples use as RNCComprador (see the builder fixtures).
 * The request may override it with `compradorRnc` / `compradorRazonSocial`.
 */
export const DEFAULT_BUYER = { rnc: "131880681", razonSocial: "CLIENTE DE PRUEBA" } as const;
/** Far-future expiry: TesteCF does not tie the sequence to an authorized range. */
export const TEST_SEQUENCE_EXPIRY = "31-12-2028";
const ITEM = { name: "Servicio de prueba e-CF", quantity: "1", unitPrice: 100, itbisRate: 18 } as const;
const TRACK_ID = /^[A-Za-z0-9-]{1,100}$/;

export interface IssuerProfile {
  rnc: string | null;
  razonSocial: string | null;
  direccion: string | null;
  sucursal: string | null;
  municipio: string | null;
  provincia: string | null;
  correoEmisor: string | null;
  actividadEconomica: string | null;
}

export interface TestInvoiceInput {
  issuer: IssuerProfile;
  encf: string;
  buyer: { rnc: string; razonSocial: string };
  issuedAt: Date;
}

/** Rejects anything but an explicit "test" environment (never certification or production). */
function requireTestEnvironment(payload: Record<string, unknown>): void {
  if (payload.environment !== TEST_ENVIRONMENT) {
    throw new HttpError(400, "TEST_ENVIRONMENT_ONLY", "Test invoices can only be sent to the DGII test environment (TesteCF).");
  }
}

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");
const clean = (value: string | null | undefined) => (value ?? "").trim();
const money = (value: number) => value.toFixed(2);
const tag = (name: string, value: string) => (value ? `<${name}>${escapeXml(value)}</${name}>` : "");

/** Issuer fields required by the E31 schema that the tenant has not filled in. */
export function missingIssuerFields(issuer: IssuerProfile): string[] {
  const missing: string[] = [];
  const rnc = digits(issuer.rnc);
  if (rnc.length !== 9 && rnc.length !== 11) missing.push("rnc");
  if (!clean(issuer.razonSocial)) missing.push("razonSocial");
  if (!clean(issuer.direccion)) missing.push("direccion");
  return missing;
}

/** E31 + 10 digits: an explicit `secuencia`, or the current Unix second (unique per second). */
export function testEncf(secuencia: unknown, nowMs: number): string {
  if (secuencia !== undefined) {
    if (typeof secuencia !== "number" || !Number.isInteger(secuencia) || secuencia < 1 || secuencia > 9_999_999_999) {
      throw new HttpError(400, "INVALID_REQUEST", "secuencia must be an integer between 1 and 9999999999.");
    }
    return `E31${String(secuencia).padStart(10, "0")}`;
  }
  return `E31${String(Math.floor(nowMs / 1000) % 10_000_000_000).padStart(10, "0")}`;
}

function buyerOf(payload: Record<string, unknown>): { rnc: string; razonSocial: string } {
  const { compradorRnc, compradorRazonSocial } = payload;
  let rnc: string = DEFAULT_BUYER.rnc;
  if (compradorRnc !== undefined) {
    const value = typeof compradorRnc === "string" ? digits(compradorRnc) : "";
    if (value.length !== 9 && value.length !== 11) throw new HttpError(400, "INVALID_REQUEST", "compradorRnc must have 9 or 11 digits.");
    rnc = value;
  }
  let razonSocial: string = DEFAULT_BUYER.razonSocial;
  if (compradorRazonSocial !== undefined) {
    const value = typeof compradorRazonSocial === "string" ? compradorRazonSocial.trim() : "";
    if (!value || value.length > 150) throw new HttpError(400, "INVALID_REQUEST", "compradorRazonSocial is invalid.");
    razonSocial = value;
  }
  return { rnc, razonSocial };
}

/**
 * Unsigned minimal E31 in DGII schema order: one taxed line (ITBIS 18%, prices without ITBIS),
 * cash payment, totals that add up. FechaHoraFirma is stamped at signing.
 */
export function buildTestInvoiceXml(input: TestInvoiceInput): string {
  const { issuer, encf, buyer } = input;
  const base = ITEM.unitPrice;
  const itbis = Math.round(base * ITEM.itbisRate) / 100;
  const total = base + itbis;
  const fechaEmision = formatDgiiDateTime(input.issuedAt).slice(0, 10);
  const municipio = /^\d{6}$/.test(clean(issuer.municipio)) ? clean(issuer.municipio) : "";
  const provincia = /^\d{6}$/.test(clean(issuer.provincia)) ? clean(issuer.provincia) : "";
  const sucursal = clean(issuer.sucursal).length <= 20 ? clean(issuer.sucursal) : "";
  const correo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(issuer.correoEmisor)) ? clean(issuer.correoEmisor) : "";
  const actividad = clean(issuer.actividadEconomica).slice(0, 100);
  return (
    '<?xml version="1.0" encoding="utf-8"?><ECF><Encabezado>' +
    tag("Version", "1.0") +
    "<IdDoc>" +
    tag("TipoeCF", "31") +
    tag("eNCF", encf) +
    tag("FechaVencimientoSecuencia", TEST_SEQUENCE_EXPIRY) +
    tag("IndicadorMontoGravado", "0") +
    tag("TipoIngresos", "01") +
    tag("TipoPago", "1") +
    `<TablaFormasPago><FormaDePago>${tag("FormaPago", "1")}${tag("MontoPago", money(total))}</FormaDePago></TablaFormasPago>` +
    "</IdDoc><Emisor>" +
    tag("RNCEmisor", digits(issuer.rnc)) +
    tag("RazonSocialEmisor", clean(issuer.razonSocial)) +
    tag("Sucursal", sucursal) +
    tag("DireccionEmisor", clean(issuer.direccion)) +
    tag("Municipio", municipio) +
    tag("Provincia", provincia) +
    tag("CorreoEmisor", correo) +
    tag("ActividadEconomica", actividad) +
    tag("FechaEmision", fechaEmision) +
    "</Emisor><Comprador>" +
    tag("RNCComprador", buyer.rnc) +
    tag("RazonSocialComprador", buyer.razonSocial) +
    "</Comprador><Totales>" +
    tag("MontoGravadoTotal", money(base)) +
    tag("MontoGravadoI1", money(base)) +
    tag("ITBIS1", String(ITEM.itbisRate)) +
    tag("TotalITBIS", money(itbis)) +
    tag("TotalITBIS1", money(itbis)) +
    tag("MontoTotal", money(total)) +
    "</Totales></Encabezado><DetallesItems><Item>" +
    tag("NumeroLinea", "1") +
    tag("IndicadorFacturacion", "1") +
    tag("NombreItem", ITEM.name) +
    tag("IndicadorBienoServicio", "2") +
    tag("CantidadItem", ITEM.quantity) +
    tag("PrecioUnitarioItem", money(base)) +
    tag("MontoItem", money(base)) +
    "</Item></DetallesItems></ECF>"
  );
}

/** Authenticates against TesteCF with the tenant's test certificate; the token never leaves here. */
async function testSession(ctx: ActionContext) {
  const sign = await loadSigner(ctx, TEST_ENVIRONMENT);
  const client = ctx.deps.dgii(TEST_ENVIRONMENT);
  const { token } = await client.authenticate((seed) => sign(seed, "SemillaModel"));
  return { sign, client, token };
}

export async function sendTest(ctx: ActionContext): Promise<Response> {
  requireTestEnvironment(ctx.payload);
  const now = (ctx.deps.now ?? Date.now)();
  const encf = testEncf(ctx.payload.secuencia, now);
  const buyer = buyerOf(ctx.payload);
  const issuer = await ctx.deps.store.tenantIssuerProfile(ctx.tenantId);
  const missing = issuer ? missingIssuerFields(issuer) : ["rnc", "razonSocial", "direccion"];
  if (!issuer || missing.length > 0) {
    throw new HttpError(422, "ISSUER_INCOMPLETE", "The tenant issuer data is incomplete.", { missing });
  }

  const { sign, client, token } = await testSession(ctx);
  const signedAt = new Date(now);
  const unsigned = buildTestInvoiceXml({ issuer, encf, buyer, issuedAt: signedAt });
  const signedXml = sign(stampSignatureTime(unsigned, signedAt), "ECF");
  const codigoSeguridad = securityCodeFromSignedXml(signedXml);
  const fechaFirma = formatDgiiDateTime(signedAt);

  const sent = await client.sendEcf(token, `${digits(issuer.rnc)}${encf}.xml`, signedXml);
  if (!sent.trackId) {
    ctx.deps.log("test_send_rejected", { httpStatus: sent.httpStatus });
    return json(422, {
      error: "DGII did not accept the test invoice.",
      code: "DGII_REJECTED",
      encf,
      httpStatus: sent.httpStatus,
      estado: sent.estado,
      mensajes: sent.messages,
    });
  }

  // Best effort: DGII usually answers "En Proceso" right away; test-status re-checks later.
  let estado: string | null = null;
  let mensajes = sent.messages;
  try {
    const status = await client.trackStatus(token, sent.trackId);
    estado = status.estado;
    if (status.messages.length > 0) mensajes = status.messages;
  } catch (error) {
    if (!(error instanceof DgiiError)) throw error;
    ctx.deps.log("test_status_deferred", { kind: error.kind });
  }
  ctx.deps.log("test_send_ok", { tipoEcf: "31" });
  return json(200, { encf, trackId: sent.trackId, estado, mensajes, codigoSeguridad, fechaFirma });
}

export async function testStatus(ctx: ActionContext): Promise<Response> {
  requireTestEnvironment(ctx.payload);
  const { trackId } = ctx.payload;
  if (typeof trackId !== "string" || !TRACK_ID.test(trackId)) throw new HttpError(400, "INVALID_REQUEST", "trackId is invalid.");
  const { client, token } = await testSession(ctx);
  const result = await client.trackStatus(token, trackId);
  ctx.deps.log("test_status", { estado: result.estado });
  return json(200, { trackId, estado: result.estado, codigo: result.codigo, encf: result.encf, mensajes: result.messages });
}
