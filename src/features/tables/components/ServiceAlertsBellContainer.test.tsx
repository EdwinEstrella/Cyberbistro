import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceAlertsBellContainer } from "./ServiceAlertsBellContainer";

const mockUseAuth = vi.fn();
const mockUseServiceRequestAlerts = vi.fn();

vi.mock("../../../shared/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../hooks/useServiceRequestAlerts", () => ({
  useServiceRequestAlerts: (args: unknown) => mockUseServiceRequestAlerts(args),
}));

describe("ServiceAlertsBellContainer", () => {
  it("renders null when user has no waiter presence role", () => {
    mockUseAuth.mockReturnValue({
      tenantId: "tenant-1",
      rol: "cliente",
    });
    mockUseServiceRequestAlerts.mockReturnValue({
      alerts: [],
      attend: vi.fn(),
      attendingId: null,
      error: null,
    });

    const html = renderToStaticMarkup(<ServiceAlertsBellContainer />);
    expect(html).toBe("");
  });

  it("renders null when tenantId is missing", () => {
    mockUseAuth.mockReturnValue({
      tenantId: null,
      rol: "mesero",
    });
    mockUseServiceRequestAlerts.mockReturnValue({
      alerts: [],
      attend: vi.fn(),
      attendingId: null,
      error: null,
    });

    const html = renderToStaticMarkup(<ServiceAlertsBellContainer />);
    expect(html).toBe("");
  });

  it("renders ServiceAlertsBell when user is mesero, cajera, or admin", () => {
    mockUseAuth.mockReturnValue({
      tenantId: "tenant-1",
      rol: "mesero",
    });
    mockUseServiceRequestAlerts.mockReturnValue({
      alerts: [
        {
          id: "req-1",
          mesaNumero: 4,
          kind: "waiter",
          createdAt: "2026-11-12T15:00:00.000Z",
          sucursalId: null,
        },
      ],
      attend: vi.fn(),
      attendingId: null,
      error: null,
    });

    const html = renderToStaticMarkup(<ServiceAlertsBellContainer />);
    expect(html).toContain('aria-label="Solicitudes de mesas"');
    expect(html).toContain('data-testid="service-alerts-badge"');
    expect(html).toContain(">1<");
  });
});
