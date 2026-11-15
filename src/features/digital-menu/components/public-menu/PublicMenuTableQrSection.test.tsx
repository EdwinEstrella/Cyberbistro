import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicMenuTableQrSection } from "./PublicMenuTableQrSection";
import {
  getTableQrFileName,
  buildTableQrPrintHtml,
  type TableQrItem,
} from "../../hooks/usePublicMenuTableQrs";

describe("PublicMenuTableQrSection & usePublicMenuTableQrs helpers", () => {
  describe("getTableQrFileName", () => {
    it("generates correct per-table file names", () => {
      expect(getTableQrFileName(1, "cyber-bistro")).toBe("qr-mesa-1-cyber-bistro.png");
      expect(getTableQrFileName(42, "bistro-central")).toBe("qr-mesa-42-bistro-central.png");
      expect(getTableQrFileName(3, "Bistro Café 2026")).toBe("qr-mesa-3-bistrocaf2026.png");
      expect(getTableQrFileName(5, "")).toBe("qr-mesa-5-menu.png");
    });
  });

  describe("buildTableQrPrintHtml", () => {
    it("formats 6 cards per A4 page chunk", () => {
      const items: Array<{ mesa: number; dataUrl: string; url: string }> = Array.from(
        { length: 8 },
        (_, i) => ({
          mesa: i + 1,
          dataUrl: `data:image/png;base64,mock${i + 1}`,
          url: `https://example.com/#/menu/test?mesa=${i + 1}`,
        })
      );

      const html = buildTableQrPrintHtml(items, "Cyber Bistro");

      // 8 items = 2 sheets (first sheet 6, second sheet 2)
      const sheetMatches = html.match(/class="sheet"/g);
      expect(sheetMatches?.length).toBe(2);
      expect(html).toContain("Cyber Bistro");
      expect(html).toContain("Mesa 1");
      expect(html).toContain("Mesa 8");
      expect(html).toContain("@page");
      expect(html).toContain("A4 portrait");
    });
  });

  describe("PublicMenuTableQrSection rendering", () => {
    const defaultProps = {
      tableCount: 0,
      items: [],
      isOpen: false,
      onToggleOpen: () => {},
      generating: false,
      onDownloadTableQr: () => {},
      onPrintAll: () => {},
    };

    it("renders empty-count message when tableCount is 0", () => {
      const html = renderToStaticMarkup(
        <PublicMenuTableQrSection {...defaultProps} tableCount={0} />
      );

      expect(html).toContain("Configurá la cantidad de mesas en Ajustes para generar los QR.");
      expect(html).not.toContain("Imprimir todos");
    });

    it("renders table count badge and mandatory note about 4-digit code", () => {
      const html = renderToStaticMarkup(
        <PublicMenuTableQrSection {...defaultProps} tableCount={5} />
      );

      expect(html).toContain("5 mesas");
      expect(html).toContain("Códigos QR por mesa");
      expect(html).toContain(
        "Cada QR lleva la mesa. El cliente ingresa el código de 4 dígitos de la mesa al enviar un pedido."
      );
    });

    it("does not render table cards when collapsed (lazy behavior)", () => {
      const html = renderToStaticMarkup(
        <PublicMenuTableQrSection
          {...defaultProps}
          tableCount={3}
          isOpen={false}
        />
      );

      expect(html).toContain("Ver códigos QR");
      expect(html).not.toContain("Mesa 1");
      expect(html).not.toContain("Descargar PNG");
    });

    it("renders N cards for N tables with download button when open", () => {
      const mockItems: TableQrItem[] = [
        {
          mesa: 1,
          url: "https://cloudix-app.azokia.com/#/menu/cyber-bistro?mesa=1",
          dataUrl: "data:image/png;base64,mockqr1",
          loading: false,
        },
        {
          mesa: 2,
          url: "https://cloudix-app.azokia.com/#/menu/cyber-bistro?mesa=2",
          dataUrl: "data:image/png;base64,mockqr2",
          loading: false,
        },
        {
          mesa: 3,
          url: "https://cloudix-app.azokia.com/#/menu/cyber-bistro?mesa=3",
          dataUrl: "data:image/png;base64,mockqr3",
          loading: false,
        },
      ];

      const html = renderToStaticMarkup(
        <PublicMenuTableQrSection
          {...defaultProps}
          tableCount={3}
          isOpen={true}
          items={mockItems}
          generating={false}
        />
      );

      expect(html).toContain("Ocultar");
      expect(html).toContain("Imprimir todos");
      expect(html).toContain("Mesa 1");
      expect(html).toContain("Mesa 2");
      expect(html).toContain("Mesa 3");

      // Check per-table download button
      const downloadMatches = html.match(/Descargar PNG/g);
      expect(downloadMatches?.length).toBe(3);
    });
  });
});
