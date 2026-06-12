import React from "react";
import { describe, expect, it, vi } from "vitest";
import { FeatureGuard } from "./components/FeatureGuard";
import { appRoutes, createFiscalRouteComponent } from "./routes";

vi.mock("react-router", () => ({
  createHashRouter: vi.fn((routes) => ({ routes })),
}));

function FiscalPanelStub() {
  return React.createElement("section", null, "Fiscal panel");
}

vi.mock("../features/fiscal", () => ({
  FiscalPanel: FiscalPanelStub,
}));

describe("app routes", () => {
  it("wraps the fiscal route component in the dgii_ecf feature guard", () => {
    const FiscalRouteComponent = createFiscalRouteComponent(FiscalPanelStub);

    const element = FiscalRouteComponent();
    const props = element.props as { feature: string; children: React.ReactElement };

    expect(element.type).toBe(FeatureGuard);
    expect(props.feature).toBe("dgii_ecf");
    expect(props.children.type).toBe(FiscalPanelStub);
  });

  it("composes the actual /fiscal app route with the dgii_ecf feature guard", async () => {
    const layoutRoute = appRoutes.find((route) => "children" in route);
    const fiscalRoute = layoutRoute?.children?.find((route) => route.path === "/fiscal");

    expect(fiscalRoute).toBeDefined();
    expect(fiscalRoute?.lazy).toBeTypeOf("function");

    const lazyResult = await fiscalRoute!.lazy!();
    const element = lazyResult.Component();
    const props = element.props as { feature: string; children: React.ReactElement };

    expect(element.type).toBe(FeatureGuard);
    expect(props.feature).toBe("dgii_ecf");
    expect(props.children.type).toBe(FiscalPanelStub);
  });
});
