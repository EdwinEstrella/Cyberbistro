import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  asMenuPayload,
  buildCreateOrderRpcArgs,
  PublicDigitalMenu,
} from "./PublicDigitalMenu";
import type { PublicMenuMode } from "./lib/publicMenuMode";
import { supabase } from "../../shared/lib/supabase";

const mockParams = vi.hoisted(() => ({
  slug: "bistro-test",
  mesaParam: null as string | null,
}));

vi.mock("react-router", () => ({
  useParams: () => ({ slug: mockParams.slug }),
  useSearchParams: () => [
    new URLSearchParams(mockParams.mesaParam ? { mesa: mockParams.mesaParam } : {}),
    vi.fn(),
  ],
}));

vi.mock("../../shared/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => cb({ count: 0 })),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("./lib/useOnlineMenuStatus", () => ({
  useOnlineMenuStatus: () => ({
    isOpen: true,
    setIsOpen: vi.fn(),
    checking: false,
    checkStatus: vi.fn().mockResolvedValue(true),
  }),
}));

describe("PublicDigitalMenu payload parsing (asMenuPayload)", () => {
  it("extracts settings, items, cantidad_mesas and contact safely", () => {
    const raw = {
      settings: {
        id: "1",
        title: "Cyber Bistro",
        business_name: "Cyber Bistro SRL",
      },
      items: [
        {
          id: "item-1",
          plato_id: 101,
          name: "Hamburguesa",
          price: 450,
          category: "Principales",
        },
      ],
      cantidad_mesas: 15,
      contact: {
        wifi_name: "BistroWifi",
        whatsapp: "18095551234",
      },
    };

    const parsed = asMenuPayload(raw);
    expect(parsed.settings?.title).toBe("Cyber Bistro");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.cantidad_mesas).toBe(15);
    expect(parsed.contact.wifi_name).toBe("BistroWifi");
    expect(parsed.contact.whatsapp).toBe("18095551234");
  });

  it("handles null or undefined payload fields gracefully", () => {
    const parsed = asMenuPayload(null);
    expect(parsed.settings).toBeNull();
    expect(parsed.items).toEqual([]);
    expect(parsed.cantidad_mesas).toBe(0);
    expect(parsed.contact).toEqual({});
  });
});

describe("buildCreateOrderRpcArgs", () => {
  const sampleCart = [
    {
      id: "it-1",
      plato_id: 101,
      name: "Tacos",
      description: null,
      image_url: null,
      price: 350,
      category: "Entradas",
      sort_order: 1,
      quantity: 2,
      notes: "Sin cebolla",
    },
  ];

  it("passes in_store order_type, table number, 4-digit code, and party_size in table mode", () => {
    const mode: PublicMenuMode = { kind: "table", mesa: 4 };
    const rpcArgs = buildCreateOrderRpcArgs({
      slug: "bistro-test",
      customerName: "Juan Perez",
      customerPhone: "8095551234",
      notes: "Urgente",
      cart: sampleCart,
      mode,
      partySize: 5,
      mesaCodigo: "4321",
      clientSessionId: "sess-123",
    });

    expect(rpcArgs).toEqual({
      p_public_slug: "bistro-test",
      p_customer_name: "Juan Perez",
      p_customer_phone: "8095551234",
      p_notes: "Urgente",
      p_items: [
        {
          plato_id: 101,
          quantity: 2,
          notes: "Sin cebolla",
        },
      ],
      p_order_type: "in_store",
      p_mesa_numero: 4,
      p_mesa_codigo: "4321",
      p_client_session_id: "sess-123",
      p_party_size: 5,
    });
  });

  it("passes takeout order_type, null mesa, null code, and null party_size in takeout mode", () => {
    const mode: PublicMenuMode = { kind: "takeout", invalidMesa: false };
    const rpcArgs = buildCreateOrderRpcArgs({
      slug: "bistro-test",
      customerName: "Maria Lopez",
      customerPhone: "",
      notes: "",
      cart: sampleCart,
      mode,
      partySize: null,
      mesaCodigo: "",
      clientSessionId: "sess-456",
    });

    expect(rpcArgs).toEqual({
      p_public_slug: "bistro-test",
      p_customer_name: "Maria Lopez",
      p_customer_phone: null,
      p_notes: null,
      p_items: [
        {
          plato_id: 101,
          quantity: 2,
          notes: "Sin cebolla",
        },
      ],
      p_order_type: "takeout",
      p_mesa_numero: null,
      p_mesa_codigo: null,
      p_client_session_id: "sess-456",
      p_party_size: null,
    });
  });
});

describe("PublicDigitalMenu container rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state when initially mounting", () => {
    vi.mocked(supabase.rpc).mockReturnValue(new Promise(() => {}) as any);
    const html = renderToStaticMarkup(<PublicDigitalMenu />);
    expect(html).toContain("Cargando menú...");
  });

  it("never contains the word 'Pagar' anywhere in rendered container state", () => {
    vi.mocked(supabase.rpc).mockReturnValue(new Promise(() => {}) as any);
    const html = renderToStaticMarkup(<PublicDigitalMenu />);
    expect(html.toLowerCase()).not.toContain("pagar");
  });
});
