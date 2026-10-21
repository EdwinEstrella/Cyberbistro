import { describe, expect, it, vi } from "vitest";
import React from "react";

vi.mock("../../../shared/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { EcfTestSendView, type EcfTestSendViewProps } from "./EcfTestSendCard";

const base: EcfTestSendViewProps = {
  certificateReady: true,
  busy: null,
  result: null,
  failure: null,
  onSend: () => {},
  onCheckStatus: () => {},
};

// The view has no hooks: call it and walk the element tree (node test environment, no DOM).
function render(over: Partial<EcfTestSendViewProps> = {}) {
  const tree = EcfTestSendView({ ...base, ...over });
  let text = "";
  const buttons: Array<{ disabled: boolean; text: string }> = [];
  const walk = (node: any, sink: (value: string) => void) => {
    if (node == null || typeof node === "boolean") return;
    if (typeof node === "string" || typeof node === "number") return sink(String(node));
    if (node.type === "button") {
      let label = "";
      React.Children.forEach(node.props.children, (child) => walk(child, (value) => (label += value)));
      buttons.push({ disabled: node.props.disabled === true, text: label.trim() });
      sink(label);
      return;
    }
    if (node.props?.children) React.Children.forEach(node.props.children, (child) => walk(child, sink));
  };
  walk(tree, (value) => (text += value));
  return { text, buttons };
}

describe("EcfTestSendView", () => {
  it("offers the send button when the test certificate is ready", () => {
    const { text, buttons } = render();
    expect(buttons).toEqual([{ disabled: false, text: "Enviar factura de prueba a TesteCF" }]);
    expect(text).not.toContain("Consultar estado");
  });

  it("asks for the TesteCF certificate and disables sending without it", () => {
    const { text, buttons } = render({ certificateReady: false });
    expect(text).toContain("Cargá tu certificado en el ambiente Pruebas (TesteCF) primero.");
    expect(buttons[0].disabled).toBe(true);
  });

  it("disables the buttons while sending", () => {
    const { buttons } = render({ busy: "send" });
    expect(buttons[0]).toEqual({ disabled: true, text: "Enviando..." });
  });

  it("shows the DGII answer and the status re-check", () => {
    const { text: html, buttons } = render({
      result: { encf: "E310000000042", trackId: "track-123", estado: "Aceptado Condicional", mensajes: [{ codigo: "613", valor: "Observación" }], codigoSeguridad: "AbC123", fechaFirma: null },
    });
    expect(html).toContain("E310000000042");
    expect(html).toContain("track-123");
    expect(html).toContain("Aceptado condicional");
    expect(html).toContain("613: Observación");
    expect(html).toContain("AbC123");
    expect(buttons.map((button) => button.text)).toEqual(["Enviar factura de prueba a TesteCF", "Consultar estado"]);
  });

  it("shows failures with the DGII messages", () => {
    const { text: html } = render({ failure: { message: "La DGII rechazó la factura de prueba.", code: "DGII_REJECTED", encf: "E310000000042", mensajes: [{ codigo: null, valor: "RNC inválido" }] } });
    expect(html).toContain("La DGII rechazó la factura de prueba. (e-NCF E310000000042)");
    expect(html).toContain("Mensajes DGII: RNC inválido");
  });
});
