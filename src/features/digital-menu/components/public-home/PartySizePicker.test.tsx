import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PartySizePicker } from "./PartySizePicker";

describe("PartySizePicker", () => {
  it("renders heading and preset buttons 1 to 6 plus '+' button in a 4-column grid", () => {
    const html = renderToStaticMarkup(
      <PartySizePicker value={null} onChange={vi.fn()} />
    );

    expect(html).toContain("¿Cuántos son?");
    expect(html).toContain("grid-cols-4");
    for (let i = 1; i <= 6; i++) {
      expect(html).toContain(`>${i}</button>`);
    }
    expect(html).toContain(">+</button>");
    expect(html).toContain("min-h-12 min-w-12");
    expect(html).not.toContain('data-testid="stepper-panel"');
  });

  it("indicates selected preset size with aria-pressed, filled coral, and singular/plural label", () => {
    const htmlPlural = renderToStaticMarkup(
      <PartySizePicker value={4} onChange={vi.fn()} />
    );

    expect(htmlPlural).toContain('aria-pressed="true"');
    expect(htmlPlural).toContain("bg-[#ff906d]");
    expect(htmlPlural).toContain("border-[#ff906d]");
    expect(htmlPlural).toContain("4 personas");

    const htmlSingular = renderToStaticMarkup(
      <PartySizePicker value={1} onChange={vi.fn()} />
    );

    expect(htmlSingular).toContain("1 persona");
  });

  it("shows stepper panel when value is 7 or greater", () => {
    const html = renderToStaticMarkup(
      <PartySizePicker value={12} onChange={vi.fn()} />
    );

    expect(html).toContain('data-testid="stepper-panel"');
    expect(html).toContain('data-testid="stepper-value"');
    expect(html).toContain(">12</span>");
    expect(html).toContain("Grupo grande (7 - 99):");
  });

  it("disables decrement button when value is at lower bound 7", () => {
    const html = renderToStaticMarkup(
      <PartySizePicker value={7} onChange={vi.fn()} />
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="Disminuir comensales"');
  });

  it("disables increment button when value is at upper bound 99", () => {
    const html = renderToStaticMarkup(
      <PartySizePicker value={99} onChange={vi.fn()} />
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="Aumentar comensales"');
  });
});
