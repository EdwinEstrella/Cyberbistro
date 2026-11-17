import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PublicMenuOrderScreen,
  type PublicMenuItem,
  type CartLine,
} from "./PublicMenuOrderScreen";
import { PublicMenuCartPanel } from "./PublicMenuCartPanel";

describe("PublicMenuOrderScreen app-shell layout", () => {
  const mockSettings = {
    tenant_id: "tenant-1",
    public_slug: "test-bistro",
    title: "Test Bistro",
    description: "Comida deliciosa",
    logo_url: "https://example.com/logo.png",
    banner_url: null,
    business_name: "Test Bistro SRL",
    phone: "8095551234",
    address: "Calle 1, Santiago",
    currency: "DOP",
  };

  const sampleItems: PublicMenuItem[] = [
    {
      id: "item-1",
      plato_id: 101,
      name: "Tacos de Cerdo",
      description: "Con salsa verde",
      image_url: "https://example.com/tacos.png",
      price: 350,
      category: "Entradas",
      sort_order: 1,
    },
  ];

  const formatCurrency = (val: number, cur: string) => `${cur} $${val.toFixed(2)}`;

  it("renders header badge with whitespace-nowrap in table mode (plural)", () => {
    const html = renderToStaticMarkup(
      <PublicMenuOrderScreen
        settings={mockSettings}
        mode={{ kind: "table", mesa: 3 }}
        partySize={4}
        items={sampleItems}
        cart={[]}
        onAddItem={vi.fn()}
        onUpdateQuantity={vi.fn()}
        customerName=""
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        error={null}
        success={null}
        placing={false}
        onPlaceOrder={vi.fn()}
        onBackToHome={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain("🪑 Mesa 3 · 4 personas");
  });

  it("renders header badge with singular '1 persona' when partySize is 1", () => {
    const html = renderToStaticMarkup(
      <PublicMenuOrderScreen
        settings={mockSettings}
        mode={{ kind: "table", mesa: 7 }}
        partySize={1}
        items={sampleItems}
        cart={[]}
        onAddItem={vi.fn()}
        onUpdateQuantity={vi.fn()}
        customerName=""
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        error={null}
        success={null}
        placing={false}
        onPlaceOrder={vi.fn()}
        onBackToHome={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("🪑 Mesa 7 · 1 persona");
    expect(html).not.toContain("1 personas");
    expect(html).toContain("whitespace-nowrap");
  });

  it("renders header badge for takeout mode with whitespace-nowrap", () => {
    const html = renderToStaticMarkup(
      <PublicMenuOrderScreen
        settings={mockSettings}
        mode={{ kind: "takeout", invalidMesa: false }}
        partySize={null}
        items={sampleItems}
        cart={[]}
        onAddItem={vi.fn()}
        onUpdateQuantity={vi.fn()}
        customerName=""
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        error={null}
        success={null}
        placing={false}
        onPlaceOrder={vi.fn()}
        onBackToHome={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("🛍 Para llevar");
    expect(html).toContain("whitespace-nowrap");
  });

  it("renders search input with placeholder 'Buscar en el menú' and descriptive aria-label", () => {
    const html = renderToStaticMarkup(
      <PublicMenuOrderScreen
        settings={mockSettings}
        mode={{ kind: "table", mesa: 2 }}
        partySize={2}
        items={sampleItems}
        cart={[]}
        onAddItem={vi.fn()}
        onUpdateQuantity={vi.fn()}
        customerName=""
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        error={null}
        success={null}
        placing={false}
        onPlaceOrder={vi.fn()}
        onBackToHome={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain('placeholder="Buscar en el menú"');
    expect(html).toContain('aria-label="Buscar platos, categorías o ingredientes en el menú"');
  });

  it("renders floating cart summary with singular '1 item', whitespace-nowrap, safe area, and extra scroll padding", () => {
    const singleCart: CartLine[] = [
      {
        ...sampleItems[0],
        quantity: 1,
      },
    ];

    const html = renderToStaticMarkup(
      <PublicMenuOrderScreen
        settings={mockSettings}
        mode={{ kind: "table", mesa: 2 }}
        partySize={2}
        items={sampleItems}
        cart={singleCart}
        onAddItem={vi.fn()}
        onUpdateQuantity={vi.fn()}
        customerName=""
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        error={null}
        success={null}
        placing={false}
        onPlaceOrder={vi.fn()}
        onBackToHome={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("1 item");
    expect(html).not.toContain("1 items");
    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain("left-1/2 -translate-x-1/2");
    expect(html).toContain("pb-[calc(10.5rem+env(safe-area-inset-bottom,0px))]");
  });

  it("renders floating cart summary with plural 'N items' when itemCount > 1", () => {
    const multiCart: CartLine[] = [
      {
        ...sampleItems[0],
        quantity: 3,
      },
    ];

    const html = renderToStaticMarkup(
      <PublicMenuOrderScreen
        settings={mockSettings}
        mode={{ kind: "table", mesa: 2 }}
        partySize={2}
        items={sampleItems}
        cart={multiCart}
        onAddItem={vi.fn()}
        onUpdateQuantity={vi.fn()}
        customerName=""
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        error={null}
        success={null}
        placing={false}
        onPlaceOrder={vi.fn()}
        onBackToHome={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("3 items");
    expect(html).toContain("whitespace-nowrap");
  });

  it("asserts the word 'Pagar' is completely absent from the public menu app", () => {
    const multiCart: CartLine[] = [
      {
        ...sampleItems[0],
        quantity: 2,
      },
    ];

    const html = renderToStaticMarkup(
      <PublicMenuOrderScreen
        settings={mockSettings}
        mode={{ kind: "table", mesa: 2 }}
        partySize={2}
        items={sampleItems}
        cart={multiCart}
        onAddItem={vi.fn()}
        onUpdateQuantity={vi.fn()}
        customerName=""
        onCustomerNameChange={vi.fn()}
        customerPhone=""
        onCustomerPhoneChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        mesaCodigo=""
        onMesaCodigoChange={vi.fn()}
        mesaCodeError={null}
        error={null}
        success={null}
        placing={false}
        onPlaceOrder={vi.fn()}
        onBackToHome={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html.toLowerCase()).not.toContain("pagar");
  });

  type ScreenProps = React.ComponentProps<typeof PublicMenuOrderScreen>;

  const renderScreen = (overrides: Partial<ScreenProps> = {}) => {
    const defaultProps: ScreenProps = {
      settings: mockSettings,
      mode: { kind: "takeout", invalidMesa: false },
      partySize: null,
      items: sampleItems,
      cart: [],
      onAddItem: vi.fn(),
      onUpdateQuantity: vi.fn(),
      customerName: "",
      onCustomerNameChange: vi.fn(),
      customerPhone: "",
      onCustomerPhoneChange: vi.fn(),
      notes: "",
      onNotesChange: vi.fn(),
      mesaCodigo: "",
      onMesaCodigoChange: vi.fn(),
      mesaCodeError: null,
      error: null,
      success: null,
      placing: false,
      onPlaceOrder: vi.fn(),
      onBackToHome: vi.fn(),
      currencyFormatter: formatCurrency,
    };
    return renderToStaticMarkup(<PublicMenuOrderScreen {...defaultProps} {...overrides} />);
  };

  it("renders floating cart bar when cart has items and hides it when empty", () => {
    const cartLine: CartLine = {
      ...sampleItems[0],
      quantity: 2,
    };

    const htmlWithCart = renderScreen({ cart: [cartLine] });

    expect(htmlWithCart).toContain('data-testid="floating-cart-bar"');
    expect(htmlWithCart).toContain("Ver pedido");
    expect(htmlWithCart).toContain("bg-[#ff906d]");

    const htmlEmptyCart = renderScreen({ cart: [] });

    expect(htmlEmptyCart).not.toContain('data-testid="floating-cart-bar"');
  });

  it("renders restaurant name in Space Grotesk 22px and open/closed status in header", () => {
    const htmlOpen = renderScreen({ isOpen: true });

    expect(htmlOpen).toContain("Test Bistro");
    expect(htmlOpen).toContain("text-[22px]");
    expect(htmlOpen).toContain("Abierto ahora");

    const htmlClosed = renderScreen({ isOpen: false });

    expect(htmlClosed).toContain("Cerrado");
  });
});

describe("PublicMenuCartPanel singular/plural items", () => {
  it("renders singular '1 item' with whitespace-nowrap in 'Tu pedido' badge", () => {
    const html = renderToStaticMarkup(
      <PublicMenuCartPanel
        cart={[]}
        currency="DOP"
        isTableMode={true}
        itemCount={1}
        total={350}
        showMobileCart={false}
        onCloseMobileCart={vi.fn()}
        onUpdateQuantity={vi.fn()}
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
        currencyFormatter={(v, c) => `${c} $${v}`}
      />
    );

    expect(html).toContain("1 item");
    expect(html).not.toContain("1 items");
    expect(html).toContain("whitespace-nowrap");
  });

  it("renders plural '4 items' with whitespace-nowrap in 'Tu pedido' badge", () => {
    const html = renderToStaticMarkup(
      <PublicMenuCartPanel
        cart={[]}
        currency="DOP"
        isTableMode={true}
        itemCount={4}
        total={1400}
        showMobileCart={false}
        onCloseMobileCart={vi.fn()}
        onUpdateQuantity={vi.fn()}
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
        currencyFormatter={(v, c) => `${c} $${v}`}
      />
    );

    expect(html).toContain("4 items");
    expect(html).toContain("whitespace-nowrap");
  });
});
