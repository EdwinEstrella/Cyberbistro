import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EditDishDialog } from "./EditDishDialog";

describe("EditDishDialog", () => {
  const mockPlato = {
    id: 42,
    nombre: "Chofán Mixto",
    precio: 250,
    categoria: "Platos Fuertes",
    disponible: true,
    va_a_cocina: true,
  };

  it("renders with correct accept attribute on file input and no capture attribute", () => {
    const html = renderToStaticMarkup(
      <EditDishDialog
        editingPlato={mockPlato}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(html).toContain('accept="image/png,image/jpeg,image/webp,image/heic,image/heif"');
    expect(html).not.toContain("capture=");
  });

  it("renders square preview container when image_url exists", () => {
    const html = renderToStaticMarkup(
      <EditDishDialog
        editingPlato={mockPlato}
        customItem={{
          id: "item-1",
          tenant_id: "tenant-1",
          plato_id: 42,
          visible: true,
          image_url: "https://fotos.azokia.com/preview.webp",
        }}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(html).toContain('src="https://fotos.azokia.com/preview.webp"');
    expect(html).toContain('alt="Vista previa"');
    expect(html).toContain("aspect-square");
  });

  it("renders disabled file input and uploading indicator when uploadingImage is true", () => {
    const html = renderToStaticMarkup(
      <EditDishDialog
        editingPlato={mockPlato}
        uploadingImage={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(html).toContain("disabled");
    expect(html).toContain("Subiendo...");
  });
});
