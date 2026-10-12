import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Waits until the app settles on either the authenticated shell or the login form.
 *
 * After a reload or relaunch with a stored session, the login form is rendered
 * for a few hundred ms while the session is restored, then the app redirects to
 * the shell. Treating that first glimpse of "Correo" as "logged out" makes specs
 * type into a form that unmounts under them, so a visible login form only counts
 * once the shell has had `graceMs` to show up.
 */
export async function settleLoginOrShell(
  page: Page,
  shell: Locator,
  { graceMs = 8_000, timeoutMs = 30_000 }: { graceMs?: number; timeoutMs?: number } = {},
): Promise<"shell" | "login"> {
  const email = page.locator('input[type="email"]').first();
  await expect(email.or(shell).first()).toBeVisible({ timeout: timeoutMs });
  if (await shell.first().isVisible().catch(() => false)) return "shell";
  return shell.first().waitFor({ state: "visible", timeout: graceMs }).then(
    () => "shell" as const,
    () => "login" as const,
  );
}
