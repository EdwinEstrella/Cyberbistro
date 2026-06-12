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

  // Determine dynamic e-CF type (31 = Factura de Crédito Fiscal, 32 = Factura de Consumo, etc.)
  const ecfType = factura.ncf ? Number(factura.ncf.substring(1, 3)) : 32;

  // Calculate effective ITBIS rate (usually 18% / 0.18)
  const subtotal = Number(factura.subtotal || 0);
  const itbis = Number(factura.itbis || 0);
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
      eNCF: factura.ncf,
      IndicadorMontoGravado: 0,
      TipoIngresos: "01",
      TipoPago: payments.length > 0 ? 1 : 2,
      TablaFormasPago: {
        FormaDePago: payments.map((p: any) => ({
          FormaPago: mapPaymentMethod(p.payment_method),
          MontoPago: p.amount,
        })),
      },
      FechaLimitePago: (factura.created_at || now.toISOString()).substring(0, 10),
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
      FechaEmision: (factura.created_at || now.toISOString()).substring(0, 10),
    },
    Comprador: {
      RNCComprador: compradorRnc,
      RazonSocialComprador: compradorNombre,
    },
    Totales: {
      MontoTotal: factura.total,
      TotalITBIS: factura.itbis,
      TotalITBIS18: factura.itbis,
      MontoGravadoTotal: factura.subtotal,
      MontoGravadoI18: factura.subtotal,
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
      "@_xmlns": "http://dgii.gov.do/empresa/facturaElectronica",
      Encabezado: encabezado,
      DetallesItems: detallesItems,
      FechaHoraFirma: now.toISOString(),
    },
  };

  return transformer.json2xml(ecfObject);
}

function mapPaymentMethod(method: string): number {
  switch (method) {
    case "efectivo": return 1;
    case "tarjeta": return 3;
    case "transferencia": return 4;
    default: return 1;
  }
}
