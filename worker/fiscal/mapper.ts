import { Transformer } from "dgii-ecf";
import type { FiscalWorkerSnapshot } from "./types";

const transformer = new Transformer();

export function createUnsignedEcfXml(snapshot: FiscalWorkerSnapshot, now: Date): string {
  const payload: any = snapshot.invoicePayload;
  const factura = payload.factura;
  const items = payload.items || [];
  const payments = payload.payments || [];

  const ecfType = Number(snapshot.document.status === "pending_sync" ? 32 : 32); // Todo: get actual type

  // 1. Encabezado
  const encabezado = {
    Version: 1,
    IdDoc: {
      TipoeCF: Number(factura.fiscal_document_id ? 31 : 32), // we need the actual e-CF type from the db
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
      FechaLimitePago: factura.created_at.substring(0, 10),
      TerminoPago: "Al contado",
    },
    Emisor: {
      RNCEmisor: "130862346", // TODO: Tenant setting
      RazonSocialEmisor: "CYBERBISTRO SRL", // TODO: Tenant setting
      NombreComercial: "CyberBistro",
      Sucursal: "Casa Matriz",
      DireccionEmisor: "Av. Winston Churchill",
      Municipio: "Santo Domingo",
      Provincia: "Distrito Nacional",
      TablaTelefonoEmisor: {
        TelefonoEmisor: ["8095555555"],
      },
      CorreoEmisor: "info@cyberbistro.app",
      ActividadEconomica: "5610", // Restaurants
      FechaEmision: factura.created_at.substring(0, 10),
    },
    Comprador: {
      RNCComprador: factura.client_rnc || "000000000",
      RazonSocialComprador: factura.client_name || "Consumidor Final",
    },
    Totales: {
      MontoTotal: factura.total,
      TotalITBIS: factura.itbis,
      TotalITBIS18: factura.itbis, // Simplified for now
      MontoGravadoTotal: factura.subtotal,
      MontoGravadoI18: factura.subtotal,
    },
  };

  // 2. DetallesItems
  const detallesItems = {
    Item: items.map((item: any, index: number) => ({
      NumeroLinea: index + 1,
      TablaCodigosItem: {
        CodigosItem: {
          TipoCodigo: "INT",
          CodigoItem: item.product_id?.substring(0, 8) || "N/A",
        },
      },
      IndicadorFacturacion: item.itbis > 0 ? 1 : 0, // 1: Gravado
      NombreItem: item.product_name,
      CantidadItem: item.quantity,
      PrecioUnitarioItem: item.unit_price,
      DescuentoMonto: item.discount,
      TablaImpuestos: {
        Impuesto: {
          TipoImpuesto: 1, // ITBIS
          TasaImpuesto: 18,
          MontoImpuesto: item.itbis,
        },
      },
      MontoItem: item.total,
    })),
  };

  // Construct standard JSON structure for dgii-ecf Transformer
  // ECF root element with namespaces is typically expected.
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
