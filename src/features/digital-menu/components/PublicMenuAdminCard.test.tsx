import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicMenuAdminCard } from "./PublicMenuAdminCard";

const mockAdminData = vi.hoisted(() => ({
  loading: false,
  loadData: vi.fn(),
  data: {
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
    menus: [],
    platos: [],
    menuItems: [],
    tableCount: 10,
  },
}));

const mockSettings = vi.hoisted(() => ({
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
  setSettings: vi.fn(),
  form: {
    enabled: true,
    slug: "cyber-bistro",
    title: "Cyber Bistro",
    description: "Comida gourmet",
    logoUrl: "",
    bannerUrl: "",
    accentColor: "#f97316",
    wifi_name: "",
    wifi_password: "",
    whatsapp: "",
    instagram: "",
    facebook: "",
    tiktok: "",
    google_review_url: "",
    maps_url: "",
    suggestion_email: "",
  },
  updateField: vi.fn(),
  contactErrors: {},
  menuId: null,
  savingSettings: false,
  handleSaveSettings: vi.fn(),
}));

const mockCalendar = vi.hoisted(() => ({
  menus: [],
  setMenus: vi.fn(),
  selectedCalendarMenuId: "",
  setSelectedCalendarMenuId: vi.fn(),
  assignedMenu: undefined,
  updatingCalendar: false,
  creatingMenu: false,
  handleAssignCalendar: vi.fn(),
  handleRemoveCalendar: vi.fn(),
  handleCreateAndAssignMenu: vi.fn(),
  handleEditCalendar: vi.fn(),
}));

const mockDishes = vi.hoisted(() => ({
  platos: [],
  menuItems: [],
  dishSearch: "",
  setDishSearch: vi.fn(),
  filteredPlatosList: [],
  handleToggleDishVisibility: vi.fn(),
  handleUpdateDishCustomFields: vi.fn(),
  uploadingImage: false,
  handleImageUpload: vi.fn(),
}));

const mockShare = vi.hoisted(() => ({
  resolvedSlug: "cyber-bistro",
  qrUrl: "https://cloudix-app.azokia.com/#/menu/cyber-bistro",
  qrCodeDataUrl: "data:image/png;base64,mockqr",
  copiedLink: false,
  handleCopyLink: vi.fn(),
  handleDownloadQR: vi.fn(),
}));

const mockTableQrs = vi.hoisted(() => ({
  isOpen: false,
  setIsOpen: vi.fn(),
  handleToggleOpen: vi.fn(),
  generating: false,
  items: [],
  qrMap: {},
  handleDownloadTableQr: vi.fn(),
  handlePrintAll: vi.fn(),
}));

vi.mock("../hooks/usePublicMenuAdminData", () => ({
  usePublicMenuAdminData: () => mockAdminData,
}));

vi.mock("../hooks/usePublicMenuSettings", () => ({
  usePublicMenuSettings: () => mockSettings,
  createSettingsFormState: () => mockSettings.form,
}));

vi.mock("../hooks/usePublicMenuCalendar", () => ({
  usePublicMenuCalendar: () => mockCalendar,
}));

vi.mock("../hooks/usePublicMenuDishes", () => ({
  usePublicMenuDishes: () => mockDishes,
}));

vi.mock("../hooks/usePublicMenuShare", () => ({
  usePublicMenuShare: () => mockShare,
}));

vi.mock("../hooks/usePublicMenuTableQrs", () => ({
  usePublicMenuTableQrs: () => mockTableQrs,
}));

describe("PublicMenuAdminCard container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminData.loading = false;
  });

  it("renders loading spinner while data is loading", () => {
    mockAdminData.loading = true;
    const html = renderToStaticMarkup(<PublicMenuAdminCard tenantId="tenant-1" />);
    expect(html).toContain("Cargando configuración del menú público...");
  });

  it("renders composition with header, settings form, share section, calendar, and dishes", () => {
    const html = renderToStaticMarkup(
      <PublicMenuAdminCard tenantId="tenant-1" sucursalId="suc-1" />
    );
    expect(html).toContain("Menú público");
    expect(html).toContain("Profesional+");
    expect(html).toContain("Datos del Menú Público");
    expect(html).toContain("Información para tus clientes");
    expect(html).toContain("Código QR y Enlace Público");
    expect(html).toContain("Códigos QR por mesa");
    expect(html).toContain("10 mesas");
    expect(html).toContain("Calendario del Menú Público");
    expect(html).toContain("Carta de Platos en Web (Lista Tradicional)");
  });

  it("renders empty-count helper text when tableCount is 0", () => {
    mockAdminData.data.tableCount = 0;
    const html = renderToStaticMarkup(
      <PublicMenuAdminCard tenantId="tenant-1" sucursalId="suc-1" />
    );
    expect(html).toContain("Configurá la cantidad de mesas en Ajustes para generar los QR.");
    mockAdminData.data.tableCount = 10;
  });

  it("renders EditDishDialog when editingPlato is present", () => {
    const editingPlato = {
      id: 42,
      nombre: "Mofongo Especial",
      precio: 350,
      categoria: "Especiales",
      disponible: true,
      va_a_cocina: true,
    };
    const html = renderToStaticMarkup(
      <PublicMenuAdminCard tenantId="tenant-1" initialEditingPlato={editingPlato} />
    );
    expect(html).toContain("Personalizar Plato en Web");
    expect(html).toContain("Foto del Plato");
  });
});
