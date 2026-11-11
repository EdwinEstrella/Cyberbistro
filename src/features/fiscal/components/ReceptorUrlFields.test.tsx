import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReceptorUrlFields } from "./ReceptorUrlFields";

describe("ReceptorUrlFields", () => {
  it("renders the 3 labels, the field value three times, no https://, and does not invoke onCopied on render", () => {
    const field = "cloudix-ecf.azokia.com/133488485";
    const onCopied = vi.fn();
    const html = renderToStaticMarkup(
      <ReceptorUrlFields portalField={field} onCopied={onCopied} />
    );

    expect(html).toContain("SERVICIO DE AUTENTICACIÓN");
    expect(html).toContain("SERVICIO DE RECEPCIÓN *");
    expect(html).toContain("SERVICIO DE APROBACIÓN COMERCIAL *");

    const matches = html.split(`value="${field}"`).length - 1;
    expect(matches).toBe(3);

    expect(html).not.toContain("https://");
    expect(onCopied).not.toHaveBeenCalled();
  });
});
