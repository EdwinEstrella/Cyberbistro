import { beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { buildFacturaReceiptHtml, type TenantReceiptInfo } from "./receiptTemplates";

vi.mock("./logoCache", () => ({ getLogoUrlForPrint: vi.fn(() => null) }));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async (value: string) => `data:mock:${value}`) },
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

type Factura = Parameters<typeof buildFacturaReceiptHtml>[1];

function creditNote(overrides: Partial<Factura> = {}): Factura {
  return {
    items: [{ cantidad: 2, nombre: "Mofongo", precio_unitario: 250, subtotal: 500 }],
    subtotal: 500,
    itbis: 90,
    total: 590,
    metodo_pago: "efectivo",
    mesa_numero: 4,
    notas: null,
    created_at: "2026-10-24T15:00:00.000Z",
    estado: "nota_credito",
    propina: 0,
    cliente_nombre: "Ada Lovelace",
    cliente_rnc: "130862346",
    ncf: "E340000000007",
    ncf_tipo: "E34",
    credit_note_of: "11111111-1111-1111-1111-111111111111",
    ref_ncf: "E310000000123",
    ref_fecha_emision: "2026-10-10",
    ref_codigo_modificacion: 1,
    ref_razon_modificacion: "Cliente devolvió el pedido",
    ecf_status: null,
    ecf_track_id: null,
    ecf_security_code: null,
    ecf_submitted_at: null,
    ...overrides,
  } as Factura;
}

const accepted = {
  ecf_status: "accepted",
  ecf_track_id: "track-34",
  ecf_security_code: "AbC123",
  ecf_submitted_at: "2026-10-24T15:01:00.000Z",
};

describe("E34 credit note thermal receipt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the credit note title, e-NCF and the reference block", async () => {
    const html = await buildFacturaReceiptHtml(tenant, creditNote(), 12, 80);
    expect(html).toContain("NOTA DE CRÉDITO ELECTRÓNICA");
    expect(html).toContain("E340000000007");
    expect(html).toContain("NCF modificado");
    expect(html).toContain("E310000000123");
    expect(html).toContain("10-10-2026");
    expect(html).toContain("Anulación total");
    expect(html).toContain("Cliente devolvió el pedido");
    expect(html).not.toContain("¡Gracias por su compra!");
    expect(html).not.toContain(">Factura<");
  });

  it("prints items and positive totals, without sale-only rows", async () => {
    const html = await buildFacturaReceiptHtml(tenant, creditNote(), 12, 80);
    expect(html).toContain("Mofongo");
    expect(html).toContain("RD$ 500.00");
    expect(html).toContain("RD$ 90.00");
    expect(html).toContain("RD$ 590.00");
    expect(html).not.toContain("Recibido");
    expect(html).not.toContain("Mesa");
    expect(html).not.toContain("PAGADO");
  });

  it("adds the DGII QR, security code and signature date once accepted", async () => {
    const html = await buildFacturaReceiptHtml(tenant, creditNote(accepted), 12, 80);
    expect(QRCode.toDataURL).toHaveBeenCalledTimes(1);
    expect(html).toContain("consultatimbre");
    expect(html).toContain("encf=E340000000007");
    expect(html).toContain("AbC123");
    expect(html).toContain("Fecha de firma");
    expect(html).toContain("24-10-2026 11:01:00");
    expect(html).not.toContain("Estado e-CF");
    expect(html).not.toContain("ACEPTADO POR DGII");
    expect(html).not.toContain("Track ID");
    expect(html).not.toContain("Pendiente de aceptación DGII");
  });

  it("marks a not-yet-accepted note as pending, with no QR and no menu QR", async () => {
    const html = await buildFacturaReceiptHtml(tenant, creditNote({ ecf_status: "submitted" }), 12, 80);
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(html).toContain("Pendiente de aceptación DGII");
    expect(html).not.toContain("consultatimbre");
  });

  it("routes by credit_note_of even when estado/ncf are missing", async () => {
    const html = await buildFacturaReceiptHtml(tenant, creditNote({ estado: "pagada", ncf: null, ncf_tipo: null }), 12, 80);
    expect(html).toContain("NOTA DE CRÉDITO ELECTRÓNICA");
  });

  it("does not change the sale invoice layout", async () => {
    const html = await buildFacturaReceiptHtml(tenant, { ...creditNote(), estado: "pagada", credit_note_of: null, ncf: "E310000000123", ncf_tipo: "E31" } as Factura, 12, 80);
    expect(html).not.toContain("NOTA DE CRÉDITO ELECTRÓNICA");
    expect(html).toContain("¡Gracias por su compra!");
  });
});
