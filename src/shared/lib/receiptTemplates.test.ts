import { beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import {
  buildDispatchSlipHtml,
  buildFacturaReceiptHtml,
  buildNominaReceiptHtml,
  type TenantReceiptInfo,
} from "./receiptTemplates";

vi.mock("./logoCache", () => ({
  getLogoUrlForPrint: vi.fn(() => null),
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async (value: string) => `data:mock:${value}`),
  },
}));

const tenant: TenantReceiptInfo = {
  nombre_negocio: "CyberBistro",
  rnc: "130862346",
  direccion: "Santo Domingo",
  telefono: "809-555-0100",
  logo_url: null,
  ecf_environment: "certification",
  moneda: "DOP",
  menu_url: "https://cyberbistro.app/menu",
};

function baseFactura(overrides: Partial<Parameters<typeof buildFacturaReceiptHtml>[1]> = {}): Parameters<typeof buildFacturaReceiptHtml>[1] {
  return {
    items: [{ cantidad: 2, nombre: "Mofongo", precio_unitario: 250, subtotal: 500 }],
    subtotal: 500,
    itbis: 90,
    total: 590,
    metodo_pago: "efectivo",
    mesa_numero: 4,
    notas: null,
    created_at: "2026-06-10T12:00:00.000Z",
    pagada_at: "2026-06-10T12:05:00.000Z",
    estado: "pagada",
    propina: 0,
    monto_recibido: 600,
    cambio_devuelto: 10,
    cliente_nombre: "Ada Lovelace",
    cliente_rnc: "130862346",
    ncf: null,
    ncf_tipo: null,
    ecf_status: null,
    ecf_track_id: null,
    ecf_security_code: null,
    ecf_submitted_at: null,
    ...overrides,
  };
}

describe("receiptTemplates fiscal regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps internal receipt output free of fiscal DGII state while preserving the menu QR", async () => {
    const html = await buildFacturaReceiptHtml(tenant, baseFactura(), 42, 80);

    expect(html).toContain("Factura");
    expect(html).not.toContain("Estado e-CF");
    expect(html).not.toContain("Verificar comprobante");
    expect(html).toContain("¡Escaneá para ver nuestro Menú!");
    expect(vi.mocked(QRCode.toDataURL)).toHaveBeenCalledWith("https://cyberbistro.app/menu", { margin: 1, width: 150 });
  });

  it("keeps legacy NCF receipts on the classic path without DGII-specific labels", async () => {
    const html = await buildFacturaReceiptHtml(
      tenant,
      baseFactura({
        ncf: "B0100000042",
        ncf_tipo: "B01 - Crédito fiscal",
      }),
      42,
      80
    );

    expect(html).toContain("B0100000042");
    expect(html).not.toContain("Tipo e-CF");
    expect(html).not.toContain("Estado e-CF");
    expect(html).not.toContain("Codigo seg.");
    expect(html).not.toContain("Verificar comprobante");
  });

  it("renders accepted e-CF receipts with DGII verification QR and security code", async () => {
    const html = await buildFacturaReceiptHtml(
      tenant,
      baseFactura({
        ncf: "E310000000045",
        ncf_tipo: "E31 - Factura de credito fiscal electronica",
        ecf_status: "accepted",
        ecf_track_id: "TRK-12345",
        ecf_security_code: "ABC123",
        ecf_submitted_at: "2026-06-10T12:06:00.000Z",
      }),
      45,
      80
    );

    expect(html).not.toContain("Estado e-CF");
    expect(html).not.toContain("Tipo e-CF");
    expect(html).not.toContain("<td>Codigo seg.</td>");
    expect(html).not.toContain("Track ID");
    expect(html).toContain("Codigo de seguridad: ABC123");
    expect(html).toContain("Verificar comprobante");

    const qrCall = vi.mocked(QRCode.toDataURL).mock.calls[0];
    expect(qrCall?.[0]).toContain("https://ecf.dgii.gov.do/certecf/consultatimbre");
    expect(qrCall?.[0]).toContain("rncemisor=130862346");
    expect(qrCall?.[0]).toContain("RncComprador=130862346");
    expect(qrCall?.[0]).toContain("encf=E310000000045");
    expect(qrCall?.[0]).toContain("codigoseguridad=ABC123");
  });

  it("renders accepted E32 consumo under 250k with DGII FC verification QR (ConsultaTimbreFC) and ACEPTADO state", async () => {
    const html = await buildFacturaReceiptHtml(
      tenant,
      baseFactura({
        ncf: "E320000000045",
        ncf_tipo: "E32 - Factura de consumo electronica",
        total: 1500,
        ecf_status: "accepted",
        ecf_track_id: "TRK-98765",
        ecf_security_code: "FC1234",
        ecf_submitted_at: "2026-06-10T12:06:00.000Z",
      }),
      45,
      80
    );

    expect(html).not.toContain("Estado e-CF");
    expect(html).not.toContain("Tipo e-CF");
    expect(html).not.toContain("<td>Codigo seg.</td>");
    expect(html).not.toContain("Track ID");
    expect(html).not.toContain("¡Escaneá para ver nuestro Menú!");
    expect(html).toContain("Codigo de seguridad: FC1234");
    expect(html).toContain("Verificar comprobante");

    const qrCall = vi.mocked(QRCode.toDataURL).mock.calls[0];
    expect(qrCall?.[0]).toBe(
      "https://fc.dgii.gov.do/certecf/consultatimbrefc?rncemisor=130862346&encf=E320000000045&montototal=1500.00&codigoseguridad=FC1234"
    );
  });

  it("keeps offline e-CF receipts visibly pending without a DGII verification link", async () => {
    const html = await buildFacturaReceiptHtml(
      { ...tenant, menu_url: null },
      baseFactura({
        ncf: "E320000000046",
        ncf_tipo: "E32 - Factura de consumo electronica",
        ecf_status: "pending_offline",
        cliente_rnc: "",
      }),
      46,
      80
    );

    expect(html).not.toContain("Estado e-CF");
    expect(html).not.toContain("Tipo e-CF");
    expect(html).toContain("Documento pendiente de envio a DGII. La validez fiscal se confirmara al sincronizar.");
    expect(html).not.toContain("Verificar comprobante");
    expect(vi.mocked(QRCode.toDataURL)).not.toHaveBeenCalled();
  });

  it("keeps DGII rejection visible on e-CF receipts", async () => {
    const html = await buildFacturaReceiptHtml(
      { ...tenant, menu_url: null },
      baseFactura({
        ncf: "E310000000047",
        ncf_tipo: "E31 - Factura de credito fiscal electronica",
        ecf_status: "rejected",
        ecf_track_id: "TRK-REJECTED",
      }),
      47,
      80
    );

    expect(html).not.toContain("Estado e-CF");
    expect(html).not.toContain("Tipo e-CF");
    expect(html).toContain("Accion recomendada: revisar datos fiscales y reenviar el comprobante.");
    expect(html).not.toContain("Documento pendiente de envio a DGII");
  });

  it.each(["terminal_error", "rejected"])(
    "prints no QR and a rejection banner for a %s e-CF even with a locally computed security code",
    async (status) => {
      const html = await buildFacturaReceiptHtml(
        tenant,
        baseFactura({
          ncf: "E320000000001",
          ncf_tipo: "E32 - Factura de consumo electronica",
          total: 413,
          ecf_status: status,
          ecf_security_code: "bimE5u",
        }),
        8719,
        80
      );

      expect(html).toContain("Comprobante RECHAZADO por la DGII. Sin validez fiscal.");
      expect(html).not.toContain("Documento pendiente de envio a DGII");
      expect(html).not.toContain("Verificar comprobante");
      expect(html).not.toContain("Codigo de seguridad");
      expect(html).not.toContain("¡Escaneá para ver nuestro Menú!");
      expect(vi.mocked(QRCode.toDataURL)).not.toHaveBeenCalled();
    }
  );

  it("keeps the DGII QR and pending banner for an e-CF still waiting for DGII", async () => {
    const html = await buildFacturaReceiptHtml(
      tenant,
      baseFactura({
        ncf: "E320000000002",
        ncf_tipo: "E32 - Factura de consumo electronica",
        total: 413,
        ecf_status: "pending",
        ecf_security_code: "bimE5u",
      }),
      8720,
      80
    );

    expect(html).toContain("Documento pendiente de envio a DGII");
    expect(html).toContain("Verificar comprobante");
    expect(html).not.toContain("RECHAZADO");
  });

  it("shows RECHAZADO POR DGII on a credit note whose status is terminal_error", async () => {
    const html = await buildFacturaReceiptHtml(
      tenant,
      baseFactura({
        estado: "nota_credito",
        ncf: "E340000000001",
        ncf_tipo: "E34 - Nota de credito electronica",
        ecf_status: "terminal_error",
        ecf_security_code: "abc123",
      }),
      8721,
      80
    );

    expect(html).toContain("RECHAZADO POR DGII");
    expect(html).not.toContain("Pendiente de aceptación DGII");
    expect(html).not.toContain("Verificar comprobante");
  });

  it("builds a clean thermal payroll receipt with employee details, bonuses, deductions, and signature lines", () => {
    const html = buildNominaReceiptHtml(
      tenant,
      {
        empleadoNombre: "Juan Perez",
        empleadoCargo: "Cocinero",
        empleadoIdentificacion: "402-0000000-1",
        periodo: "2026-08 (Quincena 1)",
        frecuencia: "biweekly",
        fechaPagoIso: "2026-08-15T12:00:00.000Z",
        metodoPago: "efectivo",
        salarioBase: 15000,
        adicionales: 2000,
        deducciones: 500,
        totalDebido: 16500,
        montoPagado: 16500,
        balancePendiente: 0,
        notas: "Pago regular",
        ajustesDetalle: [
          { descripcion: "Bono asistencia", monto: 2000, tipo: "adicion" },
          { descripcion: "Adelanto", monto: 500, tipo: "deduccion" },
        ],
      },
      80
    );

    expect(html).toContain("RECIBO DE NÓMINA");
    expect(html).toContain("Juan Perez");
    expect(html).toContain("Cocinero");
    expect(html).toContain("402-0000000-1");
    expect(html).toContain("Quincenal");
    expect(html).toContain("TOTAL PAGADO");
    expect(html).toContain("Bono asistencia");
    expect(html).toContain("Adelanto");
    expect(html).toContain("Firma del Empleado");
    expect(html).toContain("Firma Autorizada");
  });

  describe("buildDispatchSlipHtml (dispatch slip when no kitchen)", () => {
    it("renders title PEDIDO with no COMANDA or COCINA wording", () => {
      const html = buildDispatchSlipHtml(
        tenant,
        {
          id: "order-12345678",
          numero_pedido: 12,
          mesa_numero: 3,
          items: [{ nombre: "Pollo Frito", cantidad: 2, categoria: "Carnes" }],
          notas: "Para mesa 3",
          created_at: "2026-11-12T12:00:00.000Z",
        },
        80
      );

      expect(html).toContain("<title>Pedido</title>");
      expect(html).toContain("<h2>PEDIDO</h2>");
      expect(html).toContain("<strong>Pedido</strong>");
      expect(html).toContain("CyberBistro");
      expect(html).not.toContain("COMANDA");
      expect(html).not.toContain("COCINA");
      expect(html).not.toContain("Nota cocina");
      expect(html).toContain("Despachar en orden de llegada");
    });

    it("renders items with quantities and line notes", () => {
      const html = buildDispatchSlipHtml(
        tenant,
        {
          id: "order-123",
          mesa_numero: 2,
          items: [
            { nombre: "Empanada de Res", cantidad: 3, categoria: "Frituras", notas: "bien tostada" },
            { nombre: "Jugo de Chinola", cantidad: 1, categoria: "Bebidas" },
          ],
        },
        80
      );

      expect(html).toContain("Empanada de Res");
      expect(html).toContain("3×");
      expect(html).toContain("↳ bien tostada");
      expect(html).toContain("Jugo de Chinola");
      expect(html).toContain("1×");
    });

    it("renders order notes properly with Note prefix", () => {
      const html = buildDispatchSlipHtml(
        tenant,
        {
          id: "order-456",
          mesa_numero: 1,
          items: [{ nombre: "Sancocho", cantidad: 1 }],
          notas: "Empacar salsa aparte",
        },
        80
      );

      expect(html).toContain("<b>Nota:</b> Empacar salsa aparte");
    });

    it("renders table number when mesa_numero > 0 and 'Para llevar' when mesa_numero is 0", () => {
      const htmlTable = buildDispatchSlipHtml(
        tenant,
        {
          mesa_numero: 8,
          items: [{ nombre: "Arroz con Habichuelas", cantidad: 1 }],
        },
        80
      );
      expect(htmlTable).toContain(">8</td>");

      const htmlTakeout = buildDispatchSlipHtml(
        tenant,
        {
          mesa_numero: 0,
          items: [{ nombre: "Arroz con Habichuelas", cantidad: 1 }],
        },
        80
      );
      expect(htmlTakeout).toContain(">Para llevar</td>");

      const htmlCustomLabel = buildDispatchSlipHtml(
        tenant,
        {
          mesa_numero: null,
          mesa_label: "Acme Corp (Empresarial)",
          items: [{ nombre: "Arroz con Habichuelas", cantidad: 1 }],
        },
        80
      );
      expect(htmlCustomLabel).toContain(">Acme Corp (Empresarial)</td>");
    });

    it("never renders prices anywhere on the slip", () => {
      const html = buildDispatchSlipHtml(
        tenant,
        {
          id: "order-999",
          numero_pedido: 99,
          mesa_numero: 4,
          items: [
            { nombre: "Chivo Liniero", cantidad: 2, precio: 450, categoria: "Platos Fuertes" },
            { nombre: "Cerveza Presidente", cantidad: 2, precio: 180, categoria: "Bebidas" },
          ],
          notas: "Cobrado",
        },
        80
      );

      expect(html).not.toContain("450");
      expect(html).not.toContain("180");
      expect(html).not.toContain("RD$");
      expect(html).not.toContain("Subtotal");
      expect(html).not.toContain("TOTAL");
      expect(html).not.toContain("ITBIS");
      expect(html).not.toContain("Precio");
    });
  });
});
