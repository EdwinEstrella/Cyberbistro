import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UrlCopyField } from "./UrlCopyField";

describe("UrlCopyField", () => {
  it("renders the label and exact field value without https:// or suffix elements", () => {
    const field = "cloudix-ecf.azokia.com/133488485";
    const label = "SERVICIO DE AUTENTICACIÓN";
    const html = renderToStaticMarkup(
      <UrlCopyField label={label} field={field} onCopy={vi.fn()} />
    );

    expect(html).toContain(label);
    expect(html).toContain(`value="${field}"`);
    expect(html).toContain("readonly");
    expect(html).not.toContain("https://");
    expect(html).not.toContain("/fe/");

    const inputMatches = html.match(/<input\b/g);
    expect(inputMatches).toHaveLength(1);
    expect(html).not.toContain("truncate");
  });
});
