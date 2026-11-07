import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicMenuAdminCard } from "./PublicMenuAdminCard";

function renderToStatic(node: any): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderToStatic).join("");
  if (typeof node.type === "function") {
    return renderToStatic(node.type(node.props || {}));
  }
  const props = node.props || {};
  const attrs = Object.entries(props)
    .filter(([k]) => k.startsWith("data-") || k === "href" || k === "target")
    .map(([k, v]) => ` ${k}="${v}"`)
    .join("");
  const children = props.children ? renderToStatic(props.children) : "";
  return `<${node.type}${attrs}>${children}</${node.type}>`;
}

const mockHookState = vi.hoisted(() => ({
  loading: false,
  loadData: vi.fn(),
  settings: {
    id: "settings-1",
    tenant_id: "tenant-1",
    sucursal_id: null,
    enabled: true,
    public_slug: "cyber-bistro",
    title: "Cyber Bistro",
    description: "Comida gourmet",
    logo_url: null,
    banner_url: null,
    theme: { accentColor: "#f97316" },
    menu_id: null,
    updated_at: "2026-11-01T00:00:00Z",
  },
  enabled: true,
  setEnabled: vi.fn(),
  slug: "cyber-bistro",
  setSlug: vi.fn(),
  title: "Cyber Bistro",
  setTitle: vi.fn(),
  description: "Comida gourmet",
  setDescription: vi.fn(),
  logoUrl: "",
  setLogoUrl: vi.fn(),
  bannerUrl: "",
  setBannerUrl: vi.fn(),
  accentColor: "#f97316",
  setAccentColor: vi.fn(),
  menuId: null,
  savingSettings: false,
  handleSaveSettings: vi.fn(),
  menus: [],
  selectedCalendarMenuId: "",
  setSelectedCalendarMenuId: vi.fn(),
  assignedMenu: undefined,
  updatingCalendar: false,
  handleAssignCalendar: vi.fn(),
  handleRemoveCalendar: vi.fn(),
  handleEditCalendar: vi.fn(),
  showCreateMenu: false,
  setShowCreateMenu: vi.fn(),
  handleOpenCreateMenu: vi.fn(),
  newMenuName: "",
  setNewMenuName: vi.fn(),
  newMenuMode: "recurring" as const,
  setNewMenuMode: vi.fn(),
  newMenuWeekStart: "2026-11-02",
  setNewMenuWeekStart: vi.fn(),
  creatingMenu: false,
  handleCreateAndAssignMenu: vi.fn(),
  platos: [],
  menuItems: [],
  dishSearch: "",
  setDishSearch: vi.fn(),
  filteredPlatosList: [],
  handleToggleDishVisibility: vi.fn(),
  handleOpenEditPlato: vi.fn(),
  editingPlato: null as any,
  setEditingPlato: vi.fn(),
  editDisplayName: "",
  setEditDisplayName: vi.fn(),
  editDescription: "",
  setEditDescription: vi.fn(),
  editImageUrl: "",
  uploadingImage: false,
  handleImageUpload: vi.fn(),
  handleUpdateDishCustomFields: vi.fn(),
  resolvedSlug: "cyber-bistro",
  qrUrl: "https://cloudix-app.azokia.com/#/menu/cyber-bistro",
  qrCodeDataUrl: "data:image/png;base64,mockqr",
  copiedLink: false,
  handleCopyLink: vi.fn(),
  handleDownloadQR: vi.fn(),
}));

vi.mock("../hooks/usePublicMenuAdmin", () => ({
  usePublicMenuAdmin: () => mockHookState,
}));

describe("PublicMenuAdminCard container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHookState.loading = false;
    mockHookState.editingPlato = null;
  });

  it("renders loading spinner while data is loading", () => {
    mockHookState.loading = true;
    const html = renderToStatic(<PublicMenuAdminCard tenantId="tenant-1" />);
    expect(html).toContain("Cargando configuración del menú público...");
  });

  it("renders composition with header, settings form, share section, calendar, and dishes", () => {
    const html = renderToStatic(<PublicMenuAdminCard tenantId="tenant-1" sucursalId="suc-1" />);
    expect(html).toContain("Menú público");
    expect(html).toContain("Profesional+");
    expect(html).toContain("Datos del Menú Público");
    expect(html).toContain("Código QR y Enlace Público");
    expect(html).toContain("Calendario del Menú Público");
    expect(html).toContain("Carta de Platos en Web (Lista Tradicional)");
  });

  it("renders EditDishDialog when editingPlato is present", () => {
    mockHookState.editingPlato = {
      id: 42,
      nombre: "Mofongo Especial",
      precio: 350,
      categoria: "Especiales",
      disponible: true,
      va_a_cocina: true,
    };
    const html = renderToStatic(<PublicMenuAdminCard tenantId="tenant-1" />);
    expect(html).toContain("Personalizar Plato en Web");
    expect(html).toContain("Foto del Plato");
  });
});
