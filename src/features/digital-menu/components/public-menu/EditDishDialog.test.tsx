import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-ignore react-dom types are not installed in devDependencies
import { flushSync } from "react-dom";
import { EditDishDialog } from "./EditDishDialog";
import { setupFakeDom, type MockElement } from "../../test-utils/fakeDom";

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

  it("renders with editingPlato null, then a plato, then null again without errors", async () => {
    const { root, findElement, cleanup } = setupFakeDom();
    try {
      // 1. Initial render with editingPlato = null
      flushSync(() => {
        root.render(
          <EditDishDialog
            editingPlato={null}
            onClose={vi.fn()}
            onSubmit={vi.fn()}
          />
        );
      });
      expect(findElement((el) => el.tagName === "INPUT")).toBeNull();

      // 2. Render with a plato
      flushSync(() => {
        root.render(
          <EditDishDialog
            editingPlato={mockPlato}
            onClose={vi.fn()}
            onSubmit={vi.fn()}
          />
        );
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const nameInput = findElement(
        (el: MockElement) => el.tagName === "INPUT" && el.attributes.type === "text"
      );
      expect(nameInput).not.toBeNull();
      expect(nameInput?.value).toBe(mockPlato.nombre);
      expect(nameInput?.attributes.placeholder).toBe(mockPlato.nombre);

      const descInput = findElement(
        (el: MockElement) => el.tagName === "TEXTAREA"
      );
      expect(descInput).not.toBeNull();
      expect(descInput?.value).toBe("");

      // 3. Render with editingPlato = null again
      flushSync(() => {
        root.render(
          <EditDishDialog
            editingPlato={null}
            onClose={vi.fn()}
            onSubmit={vi.fn()}
          />
        );
      });
      expect(findElement((el) => el.tagName === "INPUT")).toBeNull();
      expect(findElement((el) => el.tagName === "TEXTAREA")).toBeNull();
    } finally {
      cleanup();
    }
  });
});
