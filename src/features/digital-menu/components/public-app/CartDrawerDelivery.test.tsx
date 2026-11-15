import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CartDrawer, type CartDrawerProps } from "./CartDrawer";
import { EMPTY_DELIVERY_DRAFT } from "../../lib/deliveryOrder";

vi.mock("./DeliveryMapPicker", () => ({ default: () => null }));

const baseProps: CartDrawerProps = {
  isOpen: true,
  onClose: vi.fn(),
  cart: [
    {
      id: "line-1",
      plato_id: 201,
      name: "Ceviche Mixto",
      description: null,
      image_url: null,
      price: 520,
      category: "Entradas",
      sort_order: 1,
      quantity: 2,
    },
  ],
  onUpdateQuantity: vi.fn(),
  onClearCart: vi.fn(),
  currency: "DOP",
  isTableMode: false,
  itemCount: 2,
  total: 1040,
  mesaCodigo: "",
  onMesaCodigoChange: vi.fn(),
  mesaCodeError: null,
  customerName: "",
  onCustomerNameChange: vi.fn(),
  customerPhone: "",
  onCustomerPhoneChange: vi.fn(),
  notes: "",
  onNotesChange: vi.fn(),
  error: null,
  success: null,
  placing: false,
  onPlaceOrder: vi.fn(),
  currencyFormatter: (value, code) => `${code} ${value}`,
};

const render = (overrides: Partial<CartDrawerProps>) => renderToStaticMarkup(<CartDrawer {...baseProps} {...overrides} />);

describe("CartDrawer layout and delivery", () => {
  it("anchors the cart panel to the left edge of the phone screen", () => {
    const html = render({});
    const panel = html.match(/<aside[^>]*data-testid="cart-drawer-panel"[^>]*>/)?.[0] ?? "";
    expect(panel).toContain("left-0");
    expect(panel).toContain("border-r");
    expect(panel).not.toContain("right-0");
  });

  it("keeps the Pedir action visible in the sticky footer", () => {
    expect(render({})).toContain("Pedir");
  });

  it("shows the pickup/delivery selector for takeout orders when delivery props are provided", () => {
    const html = render({ delivery: EMPTY_DELIVERY_DRAFT, onDeliveryChange: vi.fn() });
    expect(html).toContain("Entrega a domicilio");
    expect(html).toContain("Teléfono (opcional)");
  });

  it("makes the phone mandatory in the placeholder once home delivery is selected", () => {
    const html = render({
      delivery: { ...EMPTY_DELIVERY_DRAFT, mode: "delivery" },
      onDeliveryChange: vi.fn(),
    });
    expect(html).toContain("Teléfono para coordinar la entrega *");
    expect(html).toContain("Usar mi ubicación actual");
  });

  it("never offers delivery on a table order", () => {
    const html = render({ isTableMode: true, mesaNumero: 4, delivery: EMPTY_DELIVERY_DRAFT, onDeliveryChange: vi.fn() });
    expect(html).not.toContain("Entrega a domicilio");
  });

  it("stays pickup-only when the delivery props are not provided", () => {
    expect(render({})).not.toContain("Entrega a domicilio");
  });
});
