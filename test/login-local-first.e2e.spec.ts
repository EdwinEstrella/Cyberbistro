import { expect, test, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UNLINKED_E2E_EMAIL = process.env.CYBERBISTRO_UNLINKED_E2E_EMAIL;
const UNLINKED_E2E_PASSWORD = process.env.CYBERBISTRO_UNLINKED_E2E_PASSWORD;
const hasUnlinkedE2ECredentials = Boolean(UNLINKED_E2E_EMAIL && UNLINKED_E2E_PASSWORD);

async function launchLoggedOutApp(): Promise<{
  app: ElectronApplication;
  page: Page;
  userDataDirectory: string;
}> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-playwright-"));
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDirectory}`],
  });

  return { app, page: await app.firstWindow(), userDataDirectory };
}

async function closeApp(app: ElectronApplication, userDataDirectory: string): Promise<void> {
  await app.close();
  await rm(userDataDirectory, { recursive: true, force: true });
}

test("exposes the local-first login controls through semantic selectors", async () => {
  const { app, page, userDataDirectory } = await launchLoggedOutApp();

  try {
    await expect(page.getByLabel("Correo")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /recordar/i })).not.toBeChecked();
    await expect(page.getByRole("status", { name: "Modo local" })).toHaveText(/local/i);
    await expect(page.getByRole("button", { name: "Iniciar Sesión" })).toBeEnabled();

    const rememberMe = page.getByRole("checkbox", { name: /recordar/i });
    await rememberMe.focus();
    await page.keyboard.press("Space");
    await expect(rememberMe).toBeChecked();

    await page.getByRole("button", { name: "Registrar Nueva Unidad" }).click();
    await expect(page).toHaveURL(/#\/register$/);
  } finally {
    await closeApp(app, userDataDirectory);
  }
});

test("shows the unlinked-membership alert only for the dedicated E2E account", async () => {
  test.skip(
    !hasUnlinkedE2ECredentials,
    "CYBERBISTRO_UNLINKED_E2E_EMAIL and CYBERBISTRO_UNLINKED_E2E_PASSWORD are required; no fallback account is used.",
  );

  const { app, page, userDataDirectory } = await launchLoggedOutApp();

  try {
    await page.getByLabel("Correo").fill(UNLINKED_E2E_EMAIL!);
    await page.getByLabel("Contraseña").fill(UNLINKED_E2E_PASSWORD!);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();

    await expect(page.getByRole("alert")).toHaveText(
      "Esta cuenta no está vinculada a ningún negocio. El administrador debe darte acceso desde Soporte.",
    );
  } finally {
    await closeApp(app, userDataDirectory);
  }
});
