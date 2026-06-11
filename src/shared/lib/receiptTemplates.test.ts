import { beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { buildFacturaReceiptHtml, type TenantReceiptInfo } from "./receiptTemplates";

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
        ncf: "E3100000045",
        ncf_tipo: "E31 - Factura de credito fiscal electronica",
        ecf_status: "accepted",
        ecf_track_id: "TRK-12345",
        ecf_security_code: "ABC123",
        ecf_submitted_at: "2026-06-10T12:06:00.000Z",
      }),
      45,
      80
    );

    expect(html).toContain("ACEPTADO POR DGII");
    expect(html).toContain("Codigo seg.");
    expect(html).toContain("ABC123");
    expect(html).toContain("Track ID");
    expect(html).toContain("Verificar comprobante");

    const qrCall = vi.mocked(QRCode.toDataURL).mock.calls[0];
    expect(qrCall?.[0]).toContain("https://ecf.dgii.gov.do/certecf/consultatimbre");
    expect(qrCall?.[0]).toContain("rncemisor=130862346");
    expect(qrCall?.[0]).toContain("RncComprador=130862346");
    expect(qrCall?.[0]).toContain("encf=E3100000045");
    expect(qrCall?.[0]).toContain("codigoseguridad=ABC123");
  });

  it("keeps offline e-CF receipts visibly pending without a DGII verification link", async () => {
    const html = await buildFacturaReceiptHtml(
      { ...tenant, menu_url: null },
      baseFactura({
        ncf: "E3200000046",
        ncf_tipo: "E32 - Factura de consumo electronica",
        ecf_status: "pending_offline",
        cliente_rnc: "",
      }),
      46,
      80
    );

    expect(html).toContain("PENDIENTE DE ENVIO DGII");
    expect(html).toContain("Documento pendiente de envio a DGII. La validez fiscal se confirmara al sincronizar.");
    expect(html).not.toContain("Verificar comprobante");
    expect(vi.mocked(QRCode.toDataURL)).not.toHaveBeenCalled();
  });

  it("keeps DGII rejection visible on e-CF receipts", async () => {
    const html = await buildFacturaReceiptHtml(
      { ...tenant, menu_url: null },
      baseFactura({
        ncf: "E3100000047",
        ncf_tipo: "E31 - Factura de credito fiscal electronica",
        ecf_status: "rejected",
        ecf_track_id: "TRK-REJECTED",
      }),
      47,
      80
    );

    expect(html).toContain("RECHAZADO POR DGII");
    expect(html).toContain("Accion recomendada: revisar datos fiscales y reenviar el comprobante.");
    expect(html).not.toContain("Documento pendiente de envio a DGII");
  });
});
