import { Transformer } from "dgii-ecf";
import { fiscalWorkerError } from "./errors";
import type { FiscalWorkerSnapshot } from "./types";

export const ECF_TYPES_WITH_SEQUENCE_EXPIRY = [31, 33, 41, 43, 44, 45, 46, 47] as const;

export function isValidDgiiDateFormat(dateStr: string): boolean {
  if (typeof dateStr !== "string") return false;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateStr.trim());
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 2000 || year > 2100) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

const transformer = new Transformer();

const DEFAULT_ITBIS_RATE = 0.18;
const INCLUSIVE_DETECTION_TOLERANCE = 0.05;

export function createUnsignedEcfXml(snapshot: FiscalWorkerSnapshot, now: Date): string {
  const payload: any = snapshot.invoicePayload;
  const factura = payload.factura || {};
  const tenant = payload.tenant || {};
  const items = payload.items || [];
  const payments = payload.payments || [];

  const tenantRnc = tenant.rnc?.trim().replace(/\D/g, "");
  if (!tenantRnc) {
    throw fiscalWorkerError("FISCAL_CONFIGURATION_INCOMPLETE", "Tenant RNC is missing or not configured.", false);
  }

  const tenantName = (tenant.nombre_negocio || tenant.nombre)?.trim();
  if (!tenantName) {
    throw fiscalWorkerError("FISCAL_CONFIGURATION_INCOMPLETE", "Tenant Business Name (nombre_negocio or nombre) is missing or not configured.", false);
  }

  const tenantAddress = tenant.direccion?.trim();
  if (!tenantAddress) {
    throw fiscalWorkerError("FISCAL_CONFIGURATION_INCOMPLETE", "Tenant Address (direccion) is missing or not configured.", false);
  }

  const sucursal = tenant.ecf_issuer_sucursal?.trim();
  if (!sucursal) {
    throw fiscalWorkerError("FISCAL_CONFIGURATION_INCOMPLETE", "ecf_issuer_sucursal is missing or not configured.", false);
  }

  const municipio = tenant.ecf_issuer_municipio?.trim();
  if (!municipio) {
    throw fiscalWorkerError("FISCAL_CONFIGURATION_INCOMPLETE", "ecf_issuer_municipio is missing or not configured.", false);
  }

  const provincia = tenant.ecf_issuer_provincia?.trim();
  if (!provincia) {
    throw fiscalWorkerError("FISCAL_CONFIGURATION_INCOMPLETE", "ecf_issuer_provincia is missing or not configured.", false);
  }

  const actividadEconomica = tenant.ecf_issuer_actividad_economica?.trim();
  if (!actividadEconomica) {
    throw fiscalWorkerError("FISCAL_CONFIGURATION_INCOMPLETE", "ecf_issuer_actividad_economica is missing or not configured.", false);
  }

  const correoEmisor = tenant.ecf_issuer_correo_emisor?.trim();
  if (!correoEmisor) {
    throw fiscalWorkerError("FISCAL_CONFIGURATION_INCOMPLETE", "ecf_issuer_correo_emisor is missing or not configured.", false);
  }

  const ncf = String(factura.ncf || "").trim();
  // DGII e-NCF: E + 2-digit type + 10-digit sequence (13 characters).
  if (!/^E(31|32|33|34|41|43|44|45|46|47)\d{10}$/.test(ncf)) {
    throw fiscalWorkerError("FISCAL_XML_INVALID", "Factura e-CF requires a 13-character eNCF of an allowed E-series type.", false);
  }

  // Determine dynamic e-CF type (31 = Factura de Credito Fiscal, 32 = Factura de Consumo, etc.)
  const ecfType = Number(ncf.substring(1, 3));

  // Calculate effective ITBIS rate (usually 18% / 0.18)
  const subtotal = Number(factura.subtotal || 0);
  const itbis = Number(factura.itbis || 0);
  const total = Number(factura.total || 0);
  assertValidMoney("subtotal", subtotal);
  assertValidMoney("itbis", itbis);
  assertValidMoney("total", total);
  assertTotalsBalance({ subtotal, itbis, total });
  const itbisRate = subtotal > 0 ? (itbis / subtotal) : DEFAULT_ITBIS_RATE;

  // Tenants with ITBIS-included pricing store menu prices on the lines while the header holds the
  // base/ITBIS split, so line subtotals sum to subtotal + itbis instead of subtotal.
  const itbisIncluded = isItbisIncludedInvoice(items.map((item: any) => Number(item.subtotal || 0)), subtotal, itbis);
  const inclusiveLines = itbisIncluded
    ? splitInclusiveLines(items.map((item: any) => Number(item.subtotal || 0)), DEFAULT_ITBIS_RATE, subtotal, itbis)
    : null;

  const creditNoteRef = ecfType === 34 ? buildCreditNoteReference(factura, now) : null;

  // Comprador Strict Validation for E31 (Crédito Fiscal)
  let compradorRnc = (factura.cliente_rnc?.trim() || "").replace(/\D/g, "");
  let compradorNombre = factura.cliente_nombre?.trim();

  if (ecfType === 31) {
    if (!compradorRnc || !compradorNombre) {
      throw fiscalWorkerError("FISCAL_CONFIGURATION_INCOMPLETE", "Factura de Crédito Fiscal (E31) requires both cliente_rnc and cliente_nombre.", false);
    }
  } else {
    compradorRnc = compradorRnc || "000000000";
    compradorNombre = compradorNombre || "Consumidor Final";
  }

  const typeKey = `E${ecfType}`;
  let fechaVencimientoSecuencia: string | null = null;
  if ((ECF_TYPES_WITH_SEQUENCE_EXPIRY as readonly number[]).includes(ecfType)) {
    const rawVence = snapshot.ecf_secuencias_rangos?.[typeKey]?.vence;
    const vence = typeof rawVence === "string" ? rawVence.trim() : "";
    if (!vence || !isValidDgiiDateFormat(vence)) {
      throw fiscalWorkerError(
        "FISCAL_CONFIGURATION_INCOMPLETE",
        `Sequence expiry date (vence) is missing or invalid for ${typeKey} in tenants.ecf_secuencias_rangos. Expected format dd-MM-yyyy.`,
        false
      );
    }
    fechaVencimientoSecuencia = vence;
  }

  // 1. Encabezado
  // DGII schema order: Version -> IdDoc -> Emisor -> Comprador -> Totales
  // IdDoc order: TipoeCF -> eNCF -> FechaVencimientoSecuencia -> IndicadorNotaCredito ->
  //              IndicadorMontoGravado -> TipoIngresos -> TipoPago -> FechaLimitePago -> TerminoPago -> TablaFormasPago
  const encabezado = {
    Version: "1.0",
    IdDoc: {
      TipoeCF: ecfType,
      eNCF: ncf,
      ...(fechaVencimientoSecuencia ? { FechaVencimientoSecuencia: fechaVencimientoSecuencia } : {}),
      ...(creditNoteRef ? { IndicadorNotaCredito: creditNoteRef.indicadorNotaCredito } : {}),
      IndicadorMontoGravado: 0,
      TipoIngresos: "01",
      TipoPago: payments.length > 0 ? 1 : 2,
      FechaLimitePago: formatDgiiDate(factura.created_at, now),
      TerminoPago: payments.length > 0 ? "Al contado" : "A credito",
      ...(payments.length > 0
        ? {
            TablaFormasPago: {
              FormaDePago: payments.map((p: any) => ({
                FormaPago: mapPaymentMethod(p.payment_method),
                MontoPago: Number(p.amount || 0).toFixed(2),
              })),
            },
          }
        : {}),
    },
    Emisor: {
      RNCEmisor: tenantRnc,
      RazonSocialEmisor: tenantName,
      NombreComercial: tenantName,
      Sucursal: sucursal,
      DireccionEmisor: tenantAddress,
      Municipio: municipio,
      Provincia: provincia,
      ...(tenant.telefono?.trim()
        ? {
            TablaTelefonoEmisor: {
              TelefonoEmisor: [tenant.telefono.trim()],
            },
          }
        : {}),
      CorreoEmisor: correoEmisor,
      ActividadEconomica: actividadEconomica,
      FechaEmision: formatDgiiDate(factura.created_at, now),
    },
    Comprador: {
      RNCComprador: compradorRnc,
      RazonSocialComprador: compradorNombre,
    },
    Totales: {
      ...(itbis > 0
        ? {
            MontoGravadoTotal: subtotal.toFixed(2),
            MontoGravadoI1: subtotal.toFixed(2),
            ITBIS1: 18,
            TotalITBIS: itbis.toFixed(2),
            TotalITBIS1: itbis.toFixed(2),
          }
        : subtotal > 0
        ? {
            MontoExento: subtotal.toFixed(2),
            TotalITBIS: "0.00",
          }
        : {}),
      MontoTotal: total.toFixed(2),
    },
  };

  // 2. DetallesItems
  // In DGII e-CF, item lines carry no per-line ITBIS subtable (TablaImpuestos does not exist in DGII XSD).
  // Taxability is indicated by IndicadorFacturacion, and MontoItem equals base price * quantity (excluding ITBIS when IndicadorMontoGravado = 0).
  const detallesItems = {
    Item: items.map((item: any, index: number) => {
      const inclusiveLine = inclusiveLines?.[index];
      const itemSubtotal = Number(item.subtotal || 0);
      const itemExplicitItbis = item.itbis !== undefined ? Number(item.itbis) : null;
      const itemItbis = itemExplicitItbis !== null
        ? itemExplicitItbis
        : (inclusiveLine ? inclusiveLine.itbis : (item.exento ? 0 : itemSubtotal * itbisRate));
      const itemTotal = inclusiveLine ? inclusiveLine.base : itemSubtotal;
      const quantity = Number(item.cantidad || 0);
      const unitPrice = inclusiveLine
        ? (quantity > 0 ? roundCurrency(inclusiveLine.base / quantity) : inclusiveLine.base)
        : Number(item.precio_unitario || 0);
      const itemDiscount = Number(item.descuento_monto ?? item.descuento ?? item.descuentoMonto ?? item.discount ?? 0);

      const indicadorFacturacion = typeof item.indicador_facturacion === "number"
        ? item.indicador_facturacion
        : typeof item.indicadorFacturacion === "number"
        ? item.indicadorFacturacion
        : (item.exento === true || itemItbis <= 0 ? 4 : 1);

      return {
        NumeroLinea: index + 1,
        TablaCodigosItem: {
          CodigosItem: {
            TipoCodigo: "INT",
            CodigoItem: String(item.plato_id || "N/A"),
          },
        },
        IndicadorFacturacion: indicadorFacturacion,
        NombreItem: item.nombre,
        CantidadItem: item.cantidad,
        PrecioUnitarioItem: unitPrice.toFixed(2),
        ...(itemDiscount > 0 ? { DescuentoMonto: itemDiscount.toFixed(2) } : {}),
        MontoItem: itemTotal.toFixed(2),
      };
    }),
  };

  // Construct standard JSON structure for dgii-ecf Transformer
  const ecfObject = {
    ECF: {
      _attributes: {
        xmlns: "http://dgii.gov.do/empresa/facturaElectronica",
      },
      Encabezado: encabezado,
      DetallesItems: detallesItems,
      ...(creditNoteRef ? { InformacionReferencia: creditNoteRef.informacionReferencia } : {}),
      FechaHoraFirma: formatDgiiDateTime(now),
    },
  };

  const xml = transformer.json2xml(ecfObject);
  assertMinimumEcfXml(xml);
  return xml;
}

const CREDIT_NOTE_REASON_MAX_LENGTH = 90;
const CREDIT_NOTE_MAX_DAYS = 30;

/**
 * Builds the E34 reference block. Element order (NCFModificado, FechaNCFModificado,
 * CodigoModificacion, RazonModificacion) follows the dgii-ecf reference document; the reason is
 * capped at the DGII 90-character limit. Fails closed when the reference is incomplete.
 */
function buildCreditNoteReference(factura: any, now: Date): {
  indicadorNotaCredito: number;
  informacionReferencia: Record<string, string | number>;
} {
  const invalid = (detail: string) =>
    fiscalWorkerError("FISCAL_XML_INVALID", `E34 credit note ${detail}.`, false);

  const refNcf = String(factura.ref_ncf ?? "").trim();
  if (!/^E3[12]\d{10}$/.test(refNcf)) {
    throw invalid("requires ref_ncf to be a 13-character E31/E32 e-NCF");
  }

  const refDate = parseDateOnly(factura.ref_fecha_emision);
  if (!refDate) throw invalid("requires a valid ref_fecha_emision");

  const codigo = Number(factura.ref_codigo_modificacion);
  if (factura.ref_codigo_modificacion == null || !Number.isInteger(codigo) || codigo < 1 || codigo > 5) {
    throw invalid("requires ref_codigo_modificacion between 1 and 5");
  }

  const emission = getSantoDomingoDateParts(parseDateOrFallback(factura.created_at, now));
  const emissionDay = Date.UTC(Number(emission.year), Number(emission.month) - 1, Number(emission.day));
  const refDay = Date.UTC(refDate.year, refDate.month - 1, refDate.day);
  const daysElapsed = Math.round((emissionDay - refDay) / 86_400_000);

  const reason = String(factura.ref_razon_modificacion ?? "").trim().slice(0, CREDIT_NOTE_REASON_MAX_LENGTH).trim();
  const pad = (n: number) => String(n).padStart(2, "0");

  return {
    indicadorNotaCredito: daysElapsed > CREDIT_NOTE_MAX_DAYS ? 1 : 0,
    informacionReferencia: {
      NCFModificado: refNcf,
      FechaNCFModificado: `${pad(refDate.day)}-${pad(refDate.month)}-${refDate.year}`,
      CodigoModificacion: codigo,
      ...(reason ? { RazonModificacion: reason } : {}),
    },
  };
}

/** Parses a `yyyy-MM-dd` date (optionally followed by a time part) without timezone shifting. */
function parseDateOnly(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

/**
 * Detects invoices issued with ITBIS-included pricing: line subtotals carry the menu (gross) price,
 * so they add up to subtotal + itbis rather than to the header subtotal.
 */
export function isItbisIncludedInvoice(lineSubtotals: number[], subtotal: number, itbis: number): boolean {
  if (!(itbis > 0) || lineSubtotals.length === 0) return false;
  const sum = lineSubtotals.reduce((acc, value) => acc + value, 0);
  return (
    Math.abs(sum - (subtotal + itbis)) <= INCLUSIVE_DETECTION_TOLERANCE &&
    Math.abs(sum - subtotal) > INCLUSIVE_DETECTION_TOLERANCE
  );
}

/**
 * Splits gross line amounts into base + ITBIS. The rounding residual is absorbed by the last line
 * so the lines add up exactly to the header subtotal and ITBIS.
 */
export function splitInclusiveLines(
  grossLines: number[],
  rate: number,
  headerSubtotal: number,
  headerItbis: number
): Array<{ base: number; itbis: number }> {
  const lines: Array<{ base: number; itbis: number }> = [];
  let baseSoFar = 0;
  let itbisSoFar = 0;

  grossLines.forEach((gross, index) => {
    if (index === grossLines.length - 1) {
      lines.push({
        base: roundCurrency(headerSubtotal - baseSoFar),
        itbis: roundCurrency(headerItbis - itbisSoFar),
      });
      return;
    }
    const base = roundCurrency(gross / (1 + rate));
    const lineItbis = roundCurrency(gross - base);
    baseSoFar += base;
    itbisSoFar += lineItbis;
    lines.push({ base, itbis: lineItbis });
  });

  return lines;
}

function mapPaymentMethod(method: string): number {
  switch (method) {
    case "efectivo": return 1;
    case "tarjeta": return 3;
    case "transferencia": return 4;
    default: return 1;
  }
}

function assertValidMoney(fieldName: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw fiscalWorkerError("FISCAL_XML_INVALID", `Factura e-CF requires a valid non-negative ${fieldName}.`, false);
  }
}

function assertTotalsBalance(input: { subtotal: number; itbis: number; total: number }): void {
  const expectedTotal = roundCurrency(input.subtotal + input.itbis);
  const actualTotal = roundCurrency(input.total);

  if (Math.abs(expectedTotal - actualTotal) > 0.01) {
    throw fiscalWorkerError(
      "FISCAL_XML_INVALID",
      `Factura e-CF total mismatch: subtotal + itbis must equal total (${expectedTotal} != ${actualTotal}).`,
      false
    );
  }
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatDgiiDate(value: unknown, fallback: Date): string {
  const date = parseDateOrFallback(value, fallback);
  const parts = getSantoDomingoDateParts(date);
  return `${parts.day}-${parts.month}-${parts.year}`;
}

function formatDgiiDateTime(date: Date): string {
  const parts = getSantoDomingoDateParts(date);
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseDateOrFallback(value: unknown, fallback: Date): Date {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function getSantoDomingoDateParts(date: Date): Record<"day" | "month" | "year" | "hour" | "minute" | "second", string> {
  const formatter = new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    day: parts.day,
    month: parts.month,
    year: parts.year,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function assertMinimumEcfXml(xml: string): void {
  const requiredTags = ["ECF", "TipoeCF", "eNCF", "RNCEmisor", "MontoTotal"];
  const missingTags = requiredTags.filter((tagName) => !hasXmlTagWithValue(xml, tagName));

  if (missingTags.length > 0) {
    throw fiscalWorkerError(
      "FISCAL_XML_INVALID",
      `Generated e-CF XML is missing required tags: ${missingTags.join(", ")}.`,
      false
    );
  }
}

function hasXmlTagWithValue(xml: string, tagName: string): boolean {
  if (tagName === "ECF") return /<ECF(?:\s[^>]*)?>[\s\S]*<\/ECF>/.test(xml);
  const match = new RegExp(`<${tagName}>([^<]+)</${tagName}>`).exec(xml);
  return Boolean(match?.[1]?.trim());
}


