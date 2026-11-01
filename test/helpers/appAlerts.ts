import type { Page } from "@playwright/test";

/**
 * Dismisses the payment-day alert modal ("Día de pago" or "Recordatorio de pago")
 * if it becomes visible within a short window (~3 s after the app shell appears).
 *
 * Scoped to the modal overlay using semantic locators (heading/text and "Aceptar" button).
 * Safe no-op (no failure, no long wait) when no alert is presented.
 */
export async function dismissPaymentAlertIfPresent(
  page: Page,
  timeoutMs = 3_000,
): Promise<void> {
  const heading = page
    .getByRole("heading", { name: /Día de pago|Recordatorio de pago/i })
    .or(page.getByText(/Día de pago|Recordatorio de pago/i));

  const modal = page.locator("div.fixed.inset-0").filter({ has: heading }).first();

  try {
    await modal.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    return;
  }

  try {
    const acceptButton = modal.getByRole("button", { name: /Aceptar/i });
    await acceptButton.click();
    await modal.waitFor({ state: "hidden", timeout: 5_000 });
  } catch {
    // If the modal was already dismissed or closed, do not fail.
  }
}
