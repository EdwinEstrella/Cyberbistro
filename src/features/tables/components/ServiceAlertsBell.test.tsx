import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceAlertsBell } from "./ServiceAlertsBell";
import type { ServiceAlert } from "../lib/serviceAlerts";

describe("ServiceAlertsBell", () => {
  const mockNow = new Date("2026-11-12T15:05:00.000Z");

  const sampleAlerts: ServiceAlert[] = [
    {
      id: "alert-1",
      mesaNumero: 3,
      kind: "waiter",
      createdAt: "2026-11-12T15:00:00.000Z",
      sucursalId: null,
    },
    {
      id: "alert-2",
      mesaNumero: 7,
      kind: "bill",
      createdAt: "2026-11-12T15:03:00.000Z",
      sucursalId: null,
    },
  ];

  it("renders closed bell button with accessible label and no badge when alerts are empty", () => {
    const html = renderToStaticMarkup(
      <ServiceAlertsBell
        alerts={[]}
        attendingId={null}
        error={null}
        now={mockNow}
        onAttend={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="Solicitudes de mesas"');
    expect(html).not.toContain('data-testid="service-alerts-badge"');
    expect(html).not.toContain("role=\"dialog\"");
  });

  it("renders badge count when alerts exist", () => {
    const html = renderToStaticMarkup(
      <ServiceAlertsBell
        alerts={sampleAlerts}
        attendingId={null}
        error={null}
        now={mockNow}
        onAttend={vi.fn()}
      />
    );

    expect(html).toContain('data-testid="service-alerts-badge"');
    expect(html).toContain(">2<");
  });

  it("renders empty state inside panel when defaultOpen is true and alerts are empty", () => {
    const html = renderToStaticMarkup(
      <ServiceAlertsBell
        alerts={[]}
        attendingId={null}
        error={null}
        now={mockNow}
        onAttend={vi.fn()}
        defaultOpen={true}
      />
    );

    expect(html).toContain("No hay solicitudes pendientes");
    expect(html).toContain('role="dialog"');
  });

  it("renders alerts list with Spanish descriptions and relative wait times", () => {
    const html = renderToStaticMarkup(
      <ServiceAlertsBell
        alerts={sampleAlerts}
        attendingId={null}
        error={null}
        now={mockNow}
        onAttend={vi.fn()}
        defaultOpen={true}
      />
    );

    expect(html).toContain("Mesa 3");
    expect(html).toContain("Llama al mesero");
    expect(html).toContain("hace 5 min");

    expect(html).toContain("Mesa 7");
    expect(html).toContain("Pide la cuenta");
    expect(html).toContain("hace 2 min");

    expect(html).toContain("Atender");
  });

  it("shows attending spinner state and disables buttons while attending an alert", () => {
    const html = renderToStaticMarkup(
      <ServiceAlertsBell
        alerts={sampleAlerts}
        attendingId="alert-1"
        error={null}
        now={mockNow}
        onAttend={vi.fn()}
        defaultOpen={true}
      />
    );

    expect(html).toContain("Atendiendo...");
    expect(html).toContain("disabled=\"\"");
  });

  it("renders inline error message inside panel when error prop is present", () => {
    const html = renderToStaticMarkup(
      <ServiceAlertsBell
        alerts={sampleAlerts}
        attendingId={null}
        error="No se pudo marcar como atendida. Intentá de nuevo."
        now={mockNow}
        onAttend={vi.fn()}
        defaultOpen={true}
      />
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("No se pudo marcar como atendida. Intentá de nuevo.");
  });
});
