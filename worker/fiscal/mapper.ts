import { Transformer } from "dgii-ecf";
import type { FiscalWorkerSnapshot } from "./types";

const transformer = new Transformer();

export function createUnsignedEcfXml(snapshot: FiscalWorkerSnapshot, now: Date): string {
  const payload: any = snapshot.invoicePayload;
  const factura = payload.factura || {};
  const tenant = payload.tenant || {};
  const items = payload.items || [];
  const payments = payload.payments || [];

  // Determine dynamic e-CF type (31 = Factura de Crédito Fiscal, 32 = Factura de Consumo, etc.)
  const ecfType = factura.ncf ? Number(factura.ncf.substring(1, 3)) : 32;

  // Calculate effective ITBIS rate (usually 18% / 0.18)
  const subtotal = Number(factura.subtotal || 0);
  const itbis = Number(factura.itbis || 0);
  const itbisRate = subtotal > 0 ? (itbis / subtotal) : 0.18;

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
      RNCEmisor: tenant.rnc || "130862346",
      RazonSocialEmisor: tenant.nombre_negocio || "CYBERBISTRO SRL",
      NombreComercial: tenant.nombre_negocio || "CyberBistro",
      Sucursal: "Casa Matriz",
      DireccionEmisor: tenant.direccion || "Av. Winston Churchill",
      Municipio: "Santo Domingo",
      Provincia: "Distrito Nacional",
      TablaTelefonoEmisor: {
        TelefonoEmisor: [tenant.telefono || "8095555555"],
      },
      CorreoEmisor: "info@cyberbistro.app",
      ActividadEconomica: "5610", // Restaurants
      FechaEmision: (factura.created_at || now.toISOString()).substring(0, 10),
    },
    Comprador: {
      RNCComprador: factura.cliente_rnc || "000000000",
      RazonSocialComprador: factura.cliente_nombre || "Consumidor Final",
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
