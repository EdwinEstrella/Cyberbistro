import React from "react";
import { describe, expect, it, vi } from "vitest";
import { Navigate } from "react-router";
import { FeatureGuard } from "./components/FeatureGuard";
import { appRoutes, createFiscalRedirectRoute } from "./routes";

vi.mock("react-router", () => ({
  createHashRouter: vi.fn((routes) => ({ routes })),
  Navigate: (props: { to: string; replace?: boolean }) =>
    React.createElement("div", { "data-testid": "navigate", ...props }),
}));

describe("app routes", () => {
  it("wraps the fiscal redirect route in the dgii_ecf feature guard", () => {
    const FiscalRedirectComponent = createFiscalRedirectRoute("/historial?tab=fiscal");

    const element = FiscalRedirectComponent();
    const props = element.props as { feature: string; children: React.ReactElement<{ to?: string; replace?: boolean }> };

    expect(element.type).toBe(FeatureGuard);
    expect(props.feature).toBe("dgii_ecf");
    expect(props.children.type).toBe(Navigate);
    expect(props.children.props.to).toBe("/historial?tab=fiscal");
    expect(props.children.props.replace).toBe(true);
  });

  it("redirects /fiscal to /historial?tab=fiscal guarded by dgii_ecf", () => {
    const layoutRoute = appRoutes.find((route) => "children" in route);
    const fiscalRoute = layoutRoute?.children?.find((route) => route.path === "/fiscal");

    expect(fiscalRoute).toBeDefined();
    expect(fiscalRoute?.Component).toBeDefined();

    const element = fiscalRoute!.Component!();
    const props = element.props as { feature: string; children: React.ReactElement<{ to?: string; replace?: boolean }> };

    expect(element.type).toBe(FeatureGuard);
    expect(props.feature).toBe("dgii_ecf");
    expect(props.children.type).toBe(Navigate);
    expect(props.children.props.to).toBe("/historial?tab=fiscal");
  });

  it("redirects /fiscal/activacion to /ajustes?tab=facturacion-electronica guarded by dgii_ecf", () => {
    const layoutRoute = appRoutes.find((route) => "children" in route);
    const activacionRoute = layoutRoute?.children?.find((route) => route.path === "/fiscal/activacion");

    expect(activacionRoute).toBeDefined();
    expect(activacionRoute?.Component).toBeDefined();

    const element = activacionRoute!.Component!();
    const props = element.props as { feature: string; children: React.ReactElement<{ to?: string; replace?: boolean }> };

    expect(element.type).toBe(FeatureGuard);
    expect(props.feature).toBe("dgii_ecf");
    expect(props.children.type).toBe(Navigate);
    expect(props.children.props.to).toBe("/ajustes?tab=facturacion-electronica");
  });
});
