import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DeliveryPicker } from "./DeliveryPicker";
import type { DeliveryDraft } from "../../lib/deliveryOrder";

vi.mock("./DeliveryMapPicker", () => ({ default: () => null }));

const pickup: DeliveryDraft = { mode: "pickup", lat: null, lng: null, reference: "" };
const delivery: DeliveryDraft = { mode: "delivery", lat: null, lng: null, reference: "" };

const render = (value: DeliveryDraft) => renderToStaticMarkup(<DeliveryPicker value={value} onChange={vi.fn()} />);

describe("DeliveryPicker", () => {
  it("offers pickup and home delivery as a two-option radio group, with pickup selected by default", () => {
    const html = render(pickup);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("Recoger en el local");
    expect(html).toContain("Entrega a domicilio");
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:(?!<button).)*Recoger en el local/s);
  });

  it("hides every delivery control while pickup is selected", () => {
    const html = render(pickup);
    expect(html).not.toContain("Usar mi ubicación actual");
    expect(html).not.toContain("Punto de referencia");
  });

  it("shows the location button, the map hint and the reference field for delivery", () => {
    const html = render(delivery);
    expect(html).toContain("Usar mi ubicación actual");
    expect(html).toContain("toca el mapa");
    expect(html).toContain('aria-label="Punto de referencia de la entrega"');
    expect(html).toContain('maxLength="300"');
  });

  it("confirms the pin only after a location was marked", () => {
    expect(render(delivery)).not.toContain("Ubicación marcada");
    expect(render({ ...delivery, lat: 18.4861, lng: -69.9312 })).toContain("Ubicación marcada");
  });

  it("keeps every touch target at least 44px tall for phones", () => {
    const html = render(delivery);
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBe(3);
    for (const button of buttons) expect(button).toContain("min-h-11");
  });
});
