import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertModal } from "./AlertModal";

describe("AlertModal", () => {
  it("returns null when open is false", () => {
    const html = renderToStaticMarkup(
      <AlertModal
        open={false}
        title="Aviso"
        message="Mensaje oculto"
        onClose={vi.fn()}
      />
    );
    expect(html).toBe("");
  });

  it("renders with high-contrast text class (text-gray-100) and not text-gray-400", () => {
    const html = renderToStaticMarkup(
      <AlertModal
        open={true}
        title="Recordatorio de pago"
        message="Por favor pagar tu negocio — RD$ 5,000.00 — para continuar."
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("text-gray-100");
    expect(html).not.toContain("text-gray-400");
    expect(html).toContain("Recordatorio de pago");
    expect(html).toContain("Por favor pagar tu negocio — RD$ 5,000.00 — para continuar.");
  });

  it("renders visible primary orange button for info and primary variants", () => {
    const infoHtml = renderToStaticMarkup(
      <AlertModal
        open={true}
        title="Aviso"
        message="Mensaje informativo"
        variant="info"
        onClose={vi.fn()}
      />
    );
    expect(infoHtml).toContain("linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)");
    expect(infoHtml).toContain("text-black");
    expect(infoHtml).not.toContain("bg-[#262626]");

    const primaryHtml = renderToStaticMarkup(
      <AlertModal
        open={true}
        title="Aviso"
        message="Mensaje primario"
        variant="primary"
        onClose={vi.fn()}
      />
    );
    expect(primaryHtml).toContain("linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)");
    expect(primaryHtml).toContain("text-black");
  });

  it("renders red background for danger variant", () => {
    const html = renderToStaticMarkup(
      <AlertModal
        open={true}
        title="Error"
        message="Mensaje de error"
        variant="danger"
        onClose={vi.fn()}
      />
    );
    expect(html).toContain("bg-red-500/90");
    expect(html).toContain("text-white");
  });
});
