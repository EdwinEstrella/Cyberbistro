import { describe, it, expect, vi, beforeEach } from "vitest";
import { MenuLinksPage } from "./MenuLinksPage";
import { canUseFeature, type Plan } from "../../shared/lib/planFeatures";
import { getMenuLinkLimit } from "./lib/menuLinkLimits";

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

const mockAuth = vi.hoisted(() => ({
  tenantId: "test-tenant-id" as string | null,
  plan: "profesional" as Plan,
}));

vi.mock("../../shared/hooks/useAuth", () => ({
  useAuth: () => ({
    tenantId: mockAuth.tenantId,
    plan: mockAuth.plan,
    loading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("../../app/context/SucursalContext", () => ({
  useSucursal: () => ({
    activeSucursalId: "test-sucursal-id",
    sucursales: [],
    loading: false,
  }),
}));

vi.mock("../digital-menu/components/PublicMenuAdminCard", () => ({
  PublicMenuAdminCard: () => (
    <div data-testid="public-menu-admin-card">
      <h2>Menú público</h2>
      <span>Profesional+</span>
    </div>
  ),
}));

vi.mock("./components/MenuLinksList", () => ({
  MenuLinksList: () => (
    <div data-testid="menu-links-list">
      <span>Links de empresa activos</span>
    </div>
  ),
}));

describe("Unified Menú Digital Screen - Plan Gating & Section Visibility", () => {
  beforeEach(() => {
    mockAuth.tenantId = "test-tenant-id";
    mockAuth.plan = "profesional";
  });

  describe("Plan feature gating contracts", () => {
    it("digital_menu is available on profesional, empresarial and corporativo, but not basico", () => {
      expect(canUseFeature("basico", "digital_menu")).toBe(false);
      expect(canUseFeature("profesional", "digital_menu")).toBe(true);
      expect(canUseFeature("empresarial", "digital_menu")).toBe(true);
      expect(canUseFeature("corporativo", "digital_menu")).toBe(true);
    });

    it("menu_links (company links) is available on empresarial and corporativo only", () => {
      expect(canUseFeature("basico", "menu_links")).toBe(false);
      expect(canUseFeature("profesional", "menu_links")).toBe(false);
      expect(canUseFeature("empresarial", "menu_links")).toBe(true);
      expect(canUseFeature("corporativo", "menu_links")).toBe(true);
    });

    it("company link limits match plan levels", () => {
      expect(getMenuLinkLimit("basico")).toBe(0);
      expect(getMenuLinkLimit("profesional")).toBe(0);
      expect(getMenuLinkLimit("empresarial")).toBe(2);
      expect(getMenuLinkLimit("corporativo")).toBe(6);
    });
  });

  describe("MenuLinksPage screen rendering and sections", () => {
    it("renders login prompt when tenantId is null", () => {
      mockAuth.tenantId = null;
      const html = renderToStatic(<MenuLinksPage />);
      expect(html).toContain("Inicia sesión para administrar el menú digital");
    });

    it("on Profesional plan: renders Menú público card, and Links de empresa section is locked with upsell to Empresarial", () => {
      mockAuth.plan = "profesional";
      const html = renderToStatic(<MenuLinksPage />);

      // Top section: Menú público is rendered
      expect(html).toContain("Menú público");
      expect(html).toContain("data-testid=\"public-menu-admin-card\"");

      // Bottom section: Links de empresa is present
      expect(html).toContain("Links de empresa");

      // But locked with upsell to Empresarial
      expect(html).toContain("Plan Empresarial Requerido");
      expect(html).toContain("Función Exclusiva");
      expect(html).toContain("Subir a Plan Empresarial por WhatsApp");
      expect(html).not.toContain("data-testid=\"menu-links-list\"");
    });

    it("on Empresarial plan: renders Menú público card AND unlocked Links de empresa list", () => {
      mockAuth.plan = "empresarial";
      const html = renderToStatic(<MenuLinksPage />);

      // Top section: Menú público is rendered
      expect(html).toContain("Menú público");
      expect(html).toContain("data-testid=\"public-menu-admin-card\"");

      // Bottom section: Links de empresa is unlocked
      expect(html).toContain("Links de empresa");
      expect(html).toContain("data-testid=\"menu-links-list\"");

      // No locked upsell
      expect(html).not.toContain("Plan Empresarial Requerido");
      expect(html).not.toContain("Subir a Plan Empresarial por WhatsApp");
    });

    it("on Corporativo plan: renders Menú público card AND unlocked Links de empresa list", () => {
      mockAuth.plan = "corporativo";
      const html = renderToStatic(<MenuLinksPage />);

      // Both sections unlocked
      expect(html).toContain("Menú público");
      expect(html).toContain("data-testid=\"public-menu-admin-card\"");
      expect(html).toContain("Links de empresa");
      expect(html).toContain("data-testid=\"menu-links-list\"");
      expect(html).not.toContain("Plan Empresarial Requerido");
    });
  });
});
