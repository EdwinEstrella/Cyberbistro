import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-ignore react-dom types are not installed in devDependencies
import { flushSync } from "react-dom";
import {
  PublicMenuOrderScreen,
  type PublicMenuItem,
  type CartLine,
} from "./PublicMenuOrderScreen";
import { PublicMenuCartPanel } from "./PublicMenuCartPanel";
import { setupFakeDom } from "../test-utils/fakeDom";

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
        onAddItemWithDetails={vi.fn()}
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
        onPartySizeChange={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain("Mesa 3 · 4 personas");
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
        onAddItemWithDetails={vi.fn()}
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
        onPartySizeChange={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("Mesa 7 · 1 persona");
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
        onAddItemWithDetails={vi.fn()}
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
        onPartySizeChange={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("🛍 Para llevar");
    expect(html).toContain("whitespace-nowrap");
  });

  it("renders invalid QR notice in takeout mode when invalidMesa is true", () => {
    const html = renderToStaticMarkup(
      <PublicMenuOrderScreen
        settings={mockSettings}
        mode={{ kind: "takeout", invalidMesa: true }}
        partySize={null}
        items={sampleItems}
        cart={[]}
        onAddItem={vi.fn()}
        onAddItemWithDetails={vi.fn()}
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
        onPartySizeChange={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("El QR de esta mesa no es válido; podés pedir para llevar.");
  });

  it("does not render invalid QR notice in takeout mode when invalidMesa is false", () => {
    const html = renderToStaticMarkup(
      <PublicMenuOrderScreen
        settings={mockSettings}
        mode={{ kind: "takeout", invalidMesa: false }}
        partySize={null}
        items={sampleItems}
        cart={[]}
        onAddItem={vi.fn()}
        onAddItemWithDetails={vi.fn()}
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
        onPartySizeChange={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).not.toContain("El QR de esta mesa no es válido; podés pedir para llevar.");
  });

  it("shows 'Mesa 3' in the top bar in table mode", () => {
    const html = renderToStaticMarkup(
      <PublicMenuOrderScreen
        settings={mockSettings}
        mode={{ kind: "table", mesa: 3 }}
        partySize={4}
        items={sampleItems}
        cart={[]}
        onAddItem={vi.fn()}
        onAddItemWithDetails={vi.fn()}
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
        onPartySizeChange={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("Mesa 3");
  });

  it("renders dish list immediately and does not contain 'Ver menú y ordenar'", () => {
    const html = renderToStaticMarkup(
      <PublicMenuOrderScreen
        settings={mockSettings}
        mode={{ kind: "takeout", invalidMesa: false }}
        partySize={null}
        items={sampleItems}
        cart={[]}
        onAddItem={vi.fn()}
        onAddItemWithDetails={vi.fn()}
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
        onPartySizeChange={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("Tacos de Cerdo");
    expect(html).not.toContain("Ver menú y ordenar");
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
        onAddItemWithDetails={vi.fn()}
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
        onPartySizeChange={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain('placeholder="¿Qué se te antoja hoy?"');
    expect(html).toContain('aria-label="Buscar platos, categorías o ingredientes en el menú"');
  });

  it("renders floating cart summary with count, total, and correct scroll padding", () => {
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
        onAddItemWithDetails={vi.fn()}
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
        onPartySizeChange={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("Ver pedido");
    expect(html).toMatch(/data-testid="floating-cart-count"[^>]*>1<\/span>/);
    expect(html).toContain("pb-[calc(9.5rem+env(safe-area-inset-bottom,0px))]");
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
        onAddItemWithDetails={vi.fn()}
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
        onPartySizeChange={vi.fn()}
        currencyFormatter={formatCurrency}
      />
    );

    expect(html).toContain("Ver pedido");
    expect(html).toMatch(/data-testid="floating-cart-count"[^>]*>3<\/span>/);
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
        onAddItemWithDetails={vi.fn()}
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
        onPartySizeChange={vi.fn()}
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
      onAddItemWithDetails: vi.fn(),
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
      onPartySizeChange: vi.fn(),
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

  it("renders restaurant name at 16px and open/closed status in header", () => {
    const htmlOpen = renderScreen({ isOpen: true });

    expect(htmlOpen).toContain("Test Bistro");
    expect(htmlOpen).toContain("text-[16px]");
    expect(htmlOpen).toContain("Abierto ahora");

    const htmlClosed = renderScreen({ isOpen: false });

    expect(htmlClosed).toContain("Cerrado");
  });

  it("shows 'Lo pediste recientemente' only for recent dishes still on the menu", () => {
    const withRecent = renderScreen({
      recentDishes: [
        { platoId: sampleItems[0].plato_id, orderedAt: new Date().toISOString() },
        { platoId: 987654, orderedAt: new Date().toISOString() },
      ],
    });
    expect(withRecent).toContain("Lo pediste recientemente");
    expect(withRecent).toContain(`data-testid="recent-dish-${sampleItems[0].plato_id}"`);
    expect(withRecent).not.toContain('data-testid="recent-dish-987654"');
    expect(withRecent).toContain(`aria-label="Repetir ${sampleItems[0].name}"`);

    expect(renderScreen({ recentDishes: [] })).not.toContain("Lo pediste recientemente");
    expect(renderScreen({ recentDishes: [{ platoId: 987654, orderedAt: new Date().toISOString() }] })).not.toContain(
      "Lo pediste recientemente"
    );
  });

  it("does not render DishDetailSheet initially when no dish is selected", () => {
    const html = renderScreen({});
    expect(html).not.toContain('data-testid="dish-detail-panel"');
  });

  it("opens DishDetailSheet when tapping dish row, but tapping '+' quick-adds without opening sheet", () => {
    const { root, findElement, cleanup } = setupFakeDom();

    try {
      const onAddItem = vi.fn();
      const onAddItemWithDetails = vi.fn();

      flushSync(() => {
        root.render(
          <PublicMenuOrderScreen
            settings={mockSettings}
            mode={{ kind: "table", mesa: 3 }}
            partySize={2}
            items={sampleItems}
            cart={[]}
            onAddItem={onAddItem}
            onAddItemWithDetails={onAddItemWithDetails}
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
            onPartySizeChange={vi.fn()}
            currencyFormatter={formatCurrency}
          />
        );
      });

      // 1. Initially DishDetailSheet is closed
      expect(
        findElement((el) => el.attributes["data-testid"] === "dish-detail-panel")
      ).toBeNull();

      // 2. Click '+' button -> triggers onAddItem, does NOT open sheet
      const plusBtn = findElement(
        (el) =>
          el.tagName === "BUTTON" &&
          el.attributes["aria-label"] === `Agregar ${sampleItems[0].name}`
      );
      expect(plusBtn).not.toBeNull();

      const plusEvent = {
        type: "click",
        bubbles: true,
      };
      plusBtn!.dispatchEvent(plusEvent);

      expect(onAddItem).toHaveBeenCalledTimes(1);
      expect(onAddItem).toHaveBeenCalledWith(sampleItems[0]);
      // Sheet must still be closed!
      expect(
        findElement((el) => el.attributes["data-testid"] === "dish-detail-panel")
      ).toBeNull();

      // 3. Click the dish row body button -> opens DishDetailSheet
      const rowBtn = findElement(
        (el) => el.tagName === "BUTTON" && el.attributes["aria-haspopup"] === "dialog"
      );
      expect(rowBtn).not.toBeNull();

      flushSync(() => {
        rowBtn!.dispatchEvent({
          type: "click",
          bubbles: true,
        });
      });

      // Sheet is now open!
      const sheetPanel = findElement(
        (el) => el.attributes["data-testid"] === "dish-detail-panel"
      );
      expect(sheetPanel).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("does not wipe user-selected quantity in DishDetailSheet when cart changes while sheet is open", () => {
    const { root, findElement, cleanup } = setupFakeDom();

    try {
      const renderWithCart = (cart: CartLine[]) => {
        return (
          <PublicMenuOrderScreen
            settings={mockSettings}
            mode={{ kind: "table", mesa: 3 }}
            partySize={2}
            items={sampleItems}
            cart={cart}
            onAddItem={vi.fn()}
            onAddItemWithDetails={vi.fn()}
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
            onPartySizeChange={vi.fn()}
            currencyFormatter={formatCurrency}
          />
        );
      };

      flushSync(() => {
        root.render(renderWithCart([]));
      });

      // Open detail sheet
      const rowBtn = findElement(
        (el) => el.tagName === "BUTTON" && el.attributes["aria-haspopup"] === "dialog"
      );
      expect(rowBtn).not.toBeNull();
      flushSync(() => {
        rowBtn!.dispatchEvent({ type: "click", bubbles: true });
      });

      const qtySpan = findElement(
        (el) => el.attributes["data-testid"] === "dish-detail-qty"
      );
      expect(qtySpan).not.toBeNull();
      expect(qtySpan?.textContent).toBe("1");

      const incrementBtn = findElement(
        (el) => el.tagName === "BUTTON" && el.attributes["aria-label"] === "Agregar uno"
      );
      expect(incrementBtn).not.toBeNull();
      flushSync(() => {
        incrementBtn!.dispatchEvent({ type: "click", bubbles: true });
      });
      expect(qtySpan?.textContent).toBe("2");

      // Cart changes while sheet is open (e.g. background sync or item added to cart)
      const newCart: CartLine[] = [{ ...sampleItems[0], quantity: 1 }];
      flushSync(() => {
        root.render(renderWithCart(newCart));
      });

      // The quantity in DishDetailSheet must NOT be wiped by the cart change (preserves state)
      const qtySpanAfter = findElement(
        (el) => el.attributes["data-testid"] === "dish-detail-qty"
      );
      expect(qtySpanAfter).not.toBeNull();
      expect(qtySpanAfter?.textContent).toBe("2");
    } finally {
      cleanup();
    }
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
