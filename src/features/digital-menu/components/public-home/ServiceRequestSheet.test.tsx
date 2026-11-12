import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceRequestSheet } from "./ServiceRequestSheet";

describe("ServiceRequestSheet", () => {
  it("does not render when isOpen is false", () => {
    const html = renderToStaticMarkup(
      <ServiceRequestSheet
        isOpen={false}
        kind="waiter"
        status="idle"
        codeError={null}
        generalError={null}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toBe("");
  });

  it("renders waiter title, input helper, and submit button in idle form state", () => {
    const html = renderToStaticMarkup(
      <ServiceRequestSheet
        isOpen={true}
        kind="waiter"
        status="idle"
        codeError={null}
        generalError={null}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("Llamar al mesero");
    expect(html).toContain('data-testid="service-request-code-input"');
    expect(html).toMatch(/inputmode="numeric"/i);
    expect(html).toMatch(/maxlength="4"/i);
    expect(html).toContain("Ingresá el código de 4 dígitos que está en tu mesa");
    expect(html).toContain('data-testid="service-request-submit-button"');
    expect(html).toContain("disabled"); // empty code initially disabled
  });

  it("renders bill request title when kind is bill", () => {
    const html = renderToStaticMarkup(
      <ServiceRequestSheet
        isOpen={true}
        kind="bill"
        status="idle"
        codeError={null}
        generalError={null}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("Pedir la cuenta");
    expect(html).toContain('data-testid="service-request-code-input"');
  });

  it("displays sending state with 'Enviando...' label", () => {
    const html = renderToStaticMarkup(
      <ServiceRequestSheet
        isOpen={true}
        kind="waiter"
        status="sending"
        codeError={null}
        generalError={null}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("Enviando...");
    expect(html).toContain('aria-disabled="true"');
  });

  it("displays codeError and generalError inline", () => {
    const html = renderToStaticMarkup(
      <ServiceRequestSheet
        isOpen={true}
        kind="waiter"
        status="error"
        codeError="Código incorrecto. Verificá el código en la mesa."
        generalError="El restaurante se encuentra cerrado en este momento"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('data-testid="service-request-code-error"');
    expect(html).toContain("Código incorrecto. Verificá el código en la mesa.");
    expect(html).toContain('data-testid="service-request-general-error"');
    expect(html).toContain("El restaurante se encuentra cerrado en este momento");
  });

  it("renders sent success state with confirmation copy and close CTA", () => {
    const html = renderToStaticMarkup(
      <ServiceRequestSheet
        isOpen={true}
        kind="waiter"
        status="sent"
        codeError={null}
        generalError={null}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('data-testid="service-request-result"');
    expect(html).toContain("¡Listo! Avisamos al personal, ya van en camino.");
    expect(html).toContain("Un mozo se acercará a tu mesa a la brevedad.");
    expect(html).toContain("Entendido");
    expect(html).not.toContain('data-testid="service-request-code-input"');
  });

  it("renders already_pending result state with gentle notification copy", () => {
    const html = renderToStaticMarkup(
      <ServiceRequestSheet
        isOpen={true}
        kind="bill"
        status="already_pending"
        codeError={null}
        generalError={null}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('data-testid="service-request-result"');
    expect(html).toContain("Ya avisamos al personal, ya van en camino.");
    expect(html).toContain("Un mozo se acercará con la cuenta a tu mesa.");
    expect(html).toContain("Entendido");
    expect(html).not.toContain('data-testid="service-request-code-input"');
  });
});
