import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ServiceRequestButtons,
  WAITER_UNAVAILABLE_HINT,
} from "./ServiceRequestButtons";

describe("ServiceRequestButtons", () => {
  it("renders both buttons with their labels and icons", () => {
    const html = renderToStaticMarkup(
      <ServiceRequestButtons
        waiterAvailable={true}
        onRequestWaiter={vi.fn()}
        onRequestBill={vi.fn()}
      />
    );

    expect(html).toContain("Llamar al mesero");
    expect(html).toContain("Pedir la cuenta");
    expect(html).toContain('data-testid="request-waiter-button"');
    expect(html).toContain('data-testid="request-bill-button"');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain(WAITER_UNAVAILABLE_HINT);
  });

  it("keeps waiter button enabled when waiterAvailable is null (fail open)", () => {
    const html = renderToStaticMarkup(
      <ServiceRequestButtons
        waiterAvailable={null}
        onRequestWaiter={vi.fn()}
        onRequestBill={vi.fn()}
      />
    );

    expect(html).toContain("Llamar al mesero");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain(WAITER_UNAVAILABLE_HINT);
  });

  it("disables waiter button and displays hint when waiterAvailable is false", () => {
    const html = renderToStaticMarkup(
      <ServiceRequestButtons
        waiterAvailable={false}
        onRequestWaiter={vi.fn()}
        onRequestBill={vi.fn()}
      />
    );

    // Waiter button disabled
    expect(html).toContain('data-testid="request-waiter-button" disabled="" aria-disabled="true"');
    expect(html).toContain("cursor-not-allowed");

    // Hint text rendered
    expect(html).toContain('data-testid="waiter-unavailable-hint"');
    expect(html).toContain(WAITER_UNAVAILABLE_HINT);

    // Bill button remains enabled
    expect(html).toMatch(/data-testid="request-bill-button"[^>]*class=/);
    expect(html).not.toMatch(/data-testid="request-bill-button"[^>]*disabled/);
  });
});
