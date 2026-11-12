import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CartDrawer } from "./CartDrawer";
import type { CartLine } from "../PublicMenuOrderScreen";

describe("CartDrawer", () => {
  const sampleCart: CartLine[] = [
    {
      id: "line-1",
      plato_id: 201,
      name: "Ceviche Mixto",
      description: "Pescado fresco, camarón y leche de tigre",
      image_url: null,
      price: 520,
      category: "Entradas",
      sort_order: 1,
      quantity: 2,
    },
  ];

  const formatCurrency = (val: number, cur: string) => `${cur} $${val}`;

  it("does not render when isOpen is false", () => {
    const html = renderToStaticMarkup(
      <CartDrawer
        isOpen={false}
        onClose={vi.fn()}
        cart={sampleCart}
        onUpdateQuantity={vi.fn()}
        onClearCart={vi.fn()}
        currency="DOP"
        isTableMode={true}
        mesaNumero={5}
        itemCount={2}
        total={1040}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        customerName=""
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        error={null}
        success={null}
        placing={false}
        onPlaceOrder={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toBe("");
  });

  it("renders cart dialog with header, items, steppers, and 'Vaciar' button when open", () => {
    const html = renderToStaticMarkup(
      <CartDrawer
        isOpen={true}
        onClose={vi.fn()}
        cart={sampleCart}
        onUpdateQuantity={vi.fn()}
        onClearCart={vi.fn()}
        currency="DOP"
        isTableMode={true}
        mesaNumero={5}
        itemCount={2}
        total={1040}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        customerName="Carlos"
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        error={null}
        success={null}
        placing={false}
        onPlaceOrder={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Pedido");
    expect(html).toContain("2 items");
    expect(html).toContain("Vaciar");
    expect(html).toContain("Ceviche Mixto");
    expect(html).toContain("DOP $1040");
    expect(html).toContain(">2</span>");
    expect(html).toContain('data-testid="cart-drawer-backdrop"');
    expect(html).toContain('data-testid="cart-drawer-panel"');
  });

  it("renders 4-digit table code input with length restriction in table mode", () => {
    const html = renderToStaticMarkup(
      <CartDrawer
        isOpen={true}
        onClose={vi.fn()}
        cart={sampleCart}
        onUpdateQuantity={vi.fn()}
        onClearCart={vi.fn()}
        currency="DOP"
        isTableMode={true}
        mesaNumero={4}
        itemCount={2}
        total={1040}
        mesaCodigo="1234"
        onMesaCodigoChange={vi.fn()}
        mesaCodeError="Código incorrecto"
        customerName="Ana"
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        error={null}
        success={null}
        placing={false}
        onPlaceOrder={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("Mesa 4");
    expect(html).toContain('placeholder="0000"');
    expect(html).toContain('maxLength="4"');
    expect(html).toContain('value="1234"');
    expect(html).toContain("Código incorrecto");
  });

  it("does not render table code input in takeout mode", () => {
    const html = renderToStaticMarkup(
      <CartDrawer
        isOpen={true}
        onClose={vi.fn()}
        cart={sampleCart}
        onUpdateQuantity={vi.fn()}
        onClearCart={vi.fn()}
        currency="DOP"
        isTableMode={false}
        itemCount={2}
        total={1040}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        customerName="Pedro"
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        error={null}
        success={null}
        placing={false}
        onPlaceOrder={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).not.toContain("Código de 4 dígitos");
    expect(html).not.toContain('placeholder="0000"');
  });

  it("renders 'Pedir' primary action button and NEVER contains the word 'Pagar'", () => {
    const html = renderToStaticMarkup(
      <CartDrawer
        isOpen={true}
        onClose={vi.fn()}
        cart={sampleCart}
        onUpdateQuantity={vi.fn()}
        onClearCart={vi.fn()}
        currency="DOP"
        isTableMode={true}
        mesaNumero={1}
        itemCount={2}
        total={1040}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        customerName="Laura"
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        error={null}
        success={null}
        placing={false}
        onPlaceOrder={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain(">Pedir<");
    expect(html.toLowerCase()).not.toContain("pagar");
  });

  it("displays 'Enviando...' while placing order", () => {
    const html = renderToStaticMarkup(
      <CartDrawer
        isOpen={true}
        onClose={vi.fn()}
        cart={sampleCart}
        onUpdateQuantity={vi.fn()}
        onClearCart={vi.fn()}
        currency="DOP"
        isTableMode={true}
        mesaNumero={1}
        itemCount={2}
        total={1040}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        customerName="Laura"
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        error={null}
        success={null}
        placing={true}
        onPlaceOrder={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("Enviando...");
    expect(html).toContain('disabled=""');
  });

  it("renders success state with order number and 'Seguir viendo el menú' CTA", () => {
    const html = renderToStaticMarkup(
      <CartDrawer
        isOpen={true}
        onClose={vi.fn()}
        cart={[]}
        onUpdateQuantity={vi.fn()}
        onClearCart={vi.fn()}
        currency="DOP"
        isTableMode={true}
        mesaNumero={1}
        itemCount={0}
        total={0}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        customerName=""
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        error={null}
        success={{ message: "Pedido enviado. Total: DOP $1040.00", numeroPedido: 42 }}
        placing={false}
        onPlaceOrder={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("¡Pedido enviado!");
    expect(html).toContain("Pedido #42");
    expect(html).toContain("Seguir viendo el menú");
  });
});
