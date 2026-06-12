import { Transformer } from "dgii-ecf";
import { fiscalWorkerError } from "./errors";
import type { FiscalWorkerSnapshot } from "./types";

const transformer = new Transformer();

export function createUnsignedEcfXml(snapshot: FiscalWorkerSnapshot, now: Date): string {
  const payload: any = snapshot.invoicePayload;
  const factura = payload.factura || {};
  const tenant = payload.tenant || {};
  const items = payload.items || [];
  const payments = payload.payments || [];

  const tenantRnc = tenant.rnc?.trim();
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
  if (!/^E(31|32|33|34|41|43|44|45|46|47)/.test(ncf)) {
    throw fiscalWorkerError("FISCAL_XML_INVALID", "Factura e-CF requires a valid eNCF starting with an allowed E-series type.", false);
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
  const itbisRate = subtotal > 0 ? (itbis / subtotal) : 0.18;

  // Comprador Strict Validation for E31 (Crédito Fiscal)
  let compradorRnc = factura.cliente_rnc?.trim();
  let compradorNombre = factura.cliente_nombre?.trim();

  if (ecfType === 31) {
    if (!compradorRnc || !compradorNombre) {
      throw fiscalWorkerError("FISCAL_CONFIGURATION_INCOMPLETE", "Factura de Crédito Fiscal (E31) requires both cliente_rnc and cliente_nombre.", false);
    }
  } else {
    compradorRnc = compradorRnc || "000000000";
    compradorNombre = compradorNombre || "Consumidor Final";
  }

  // 1. Encabezado
  const encabezado = {
    Version: 1,
    IdDoc: {
      TipoeCF: ecfType,
      eNCF: ncf,
      IndicadorMontoGravado: 0,
      TipoIngresos: "01",
      TipoPago: payments.length > 0 ? 1 : 2,
      TablaFormasPago: {
        FormaDePago: payments.map((p: any) => ({
          FormaPago: mapPaymentMethod(p.payment_method),
          MontoPago: p.amount,
        })),
      },
      FechaLimitePago: formatDgiiDate(factura.created_at, now),
      TerminoPago: "Al contado",
    },
    Emisor: {
      RNCEmisor: tenantRnc,
      RazonSocialEmisor: tenantName,
      NombreComercial: tenantName,
      Sucursal: sucursal,
      DireccionEmisor: tenantAddress,
      Municipio: municipio,
      Provincia: provincia,
      TablaTelefonoEmisor: {
        TelefonoEmisor: [tenant.telefono || ""],
      },
      CorreoEmisor: correoEmisor,
      ActividadEconomica: actividadEconomica,
      FechaEmision: formatDgiiDate(factura.created_at, now),
    },
    Comprador: {
      RNCComprador: compradorRnc,
      RazonSocialComprador: compradorNombre,
    },
    Totales: {
      MontoTotal: total,
      TotalITBIS: itbis,
      TotalITBIS18: itbis,
      MontoGravadoTotal: subtotal,
      MontoGravadoI18: subtotal,
    },
  };

  // 2. DetallesItems
  const detallesItems = {
    Item: items.map((item: any, index: number) => {
      const itemSubtotal = Number(item.subtotal || 0);
      const itemItbis = itemSubtotal * itbisRate;
      const itemTotal = itemSubtotal + itemItbis;

      return {
        NumeroLinea: index + 1,
        TablaCodigosItem: {
          CodigosItem: {
            TipoCodigo: "INT",
            CodigoItem: String(item.plato_id || "N/A"),
          },
        },
        IndicadorFacturacion: itemItbis > 0 ? 1 : 0, // 1: Gravado
        NombreItem: item.nombre,
        CantidadItem: item.cantidad,
        PrecioUnitarioItem: item.precio_unitario,
        DescuentoMonto: 0,
        TablaImpuestos: {
          Impuesto: {
            TipoImpuesto: 1, // ITBIS
            TasaImpuesto: Math.round(itbisRate * 100),
            MontoImpuesto: Number(itemItbis.toFixed(2)),
          },
        },
        MontoItem: Number(itemTotal.toFixed(2)),
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
      FechaHoraFirma: formatDgiiDateTime(now),
    },
  };

  const xml = transformer.json2xml(ecfObject);
  assertMinimumEcfXml(xml);
  return xml;
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


