import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./button";

describe("Button", () => {
  it("forwards refs so Radix asChild triggers can anchor their content", () => {
    // React 18 only hands a ref to function components wrapped in forwardRef.
    expect((Button as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.forward_ref"));
    expect(Button.displayName).toBe("Button");
  });

  it("renders a button with its data-slot and variant classes", () => {
    const html = renderToStaticMarkup(<Button variant="outline">Más acciones</Button>);
    expect(html).toContain("<button");
    expect(html).toContain('data-slot="button"');
    expect(html).toContain("Más acciones");
  });

  it("renders the child element instead of a button when asChild is set", () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <a href="/x">Ir</a>
      </Button>,
    );
    expect(html).toContain('<a href="/x"');
    expect(html).toContain('data-slot="button"');
    expect(html).not.toContain("<button");
  });
});
