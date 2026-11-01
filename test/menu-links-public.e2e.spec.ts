import { expect, test, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mainWindow } from "./support/electronMainWindow";

test.describe.configure({ timeout: 60_000 });

async function launchLoggedOutApp(): Promise<{
  app: ElectronApplication;
  page: Page;
  userDataDirectory: string;
}> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-menu-links-"));
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDirectory}`],
  });
  const page = await mainWindow(app);
  // Ensure the desktop viewport is at or above the 1024px "lg" breakpoint
  // so the sticky cart aside is rendered without needing mobile drawer toggles.
  await page.setViewportSize({ width: 1280, height: 800 });
  return { app, page, userDataDirectory };
}

async function closeApp(app: ElectronApplication, userDataDirectory?: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), 10_000);
  });
  const closing = app.close().then(() => "closed" as const, () => "closed" as const);
  const result = await Promise.race([closing, timedOut]);
  clearTimeout(timer);
  if (result !== "closed") {
    const child = app.process();
    if (child.pid !== undefined && child.exitCode === null) {
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      if (process.platform === "win32") {
        await new Promise<void>((resolve) => {
          execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => resolve());
        });
      } else {
        child.kill("SIGKILL");
      }
      await exited;
    }
  }
  if (userDataDirectory) {
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function navigateToMenuLink(page: Page, token: string): Promise<void> {
  await page.evaluate((targetToken) => {
    window.location.hash = `#/menu/c/${targetToken}`;
  }, token);
}

const companyMenuFixture = {
  available: true,
  reason: null,
  label: "Almuerzo Corporativo",
  link_type: "company",
  allow_extras: true,
  company_name: "Acme Corp",
  restaurant: {
    title: "CyberBistro",
    description: "Comida gourmet para empresas",
    logo_url: null,
    banner_url: null,
    business_name: "CyberBistro SRL",
    phone: "809-555-0101",
    address: "Calle Sol 456",
    currency: "DOP",
    theme: null,
  },
  settings: {
    title: "CyberBistro",
    description: "Comida gourmet para empresas",
    logo_url: null,
    banner_url: null,
    business_name: "CyberBistro SRL",
    phone: "809-555-0101",
    address: "Calle Sol 456",
    currency: "DOP",
    theme: null,
  },
  items: [
    {
      id: "item-101",
      plato_id: 101,
      name: "Pollo al Horno",
      description: "Pollo sazonado con finas hierbas",
      image_url: null,
      price: 350,
      category: "Platos Fuertes",
      sort_order: 1,
    },
  ],
  extras: [
    {
      id: "extra-201",
      plato_id: 201,
      name: "Bebida Refresco",
      description: "Refresco frío de lata 355ml",
      image_url: null,
      price: 75,
      category: "Bebidas",
      sort_order: 1,
    },
  ],
};

test.describe("Public digital menu by link (E2E network-mocked)", () => {
  test("1. Company link with extras allowed, validation, payload structure and success", async () => {
    const { app, page, userDataDirectory } = await launchLoggedOutApp();

    try {
      // Mock cloud probe to keep desktop circuit closed in offline/CI environments
      await page.route("**/rest/v1/tenants*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
      });

      await page.route("**/rest/v1/rpc/get_online_menu_status*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ open: true }),
        });
      });

      await page.route("**/rest/v1/rpc/get_menu_by_link*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(companyMenuFixture),
        });
      });

      let capturedPayload: {
        p_token?: string;
        p_employee_name?: string;
        p_notes?: string;
        p_items?: Array<{
          plato_id: number;
          quantity: number;
          notes?: string | null;
          extras?: Array<{ plato_id: number; quantity: number }>;
          [key: string]: unknown;
        }>;
        p_session_id?: string;
      } | null = null;

      await page.route("**/rest/v1/rpc/create_order_by_link*", async (route) => {
        capturedPayload = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            order_id: "00000000-0000-0000-0000-000000000001",
            numero_pedido: 42,
            total: 425,
          }),
        });
      });

      await navigateToMenuLink(page, "e2e-token");

      // Header shows "Menú para {company}"
      await expect(page.getByText(/Menú para Acme Corp/i)).toBeVisible({ timeout: 15_000 });

      // Add a dish (opens modal when extras are configured)
      await page.getByRole("button", { name: "Agregar Pollo al Horno al pedido" }).click();
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible();

      // Add dish to cart from modal
      await modal.getByRole("button", { name: "Agregar al pedido" }).click();
      await expect(modal).not.toBeVisible();

      // Open "Agregar extras" from cart line (accessible label: "Modificar extras para Pollo al Horno")
      const extrasButton = page.getByRole("button", { name: /Modificar extras para/i });
      await expect(extrasButton).toHaveText("Agregar extras");
      await extrasButton.click();
      await expect(modal).toBeVisible();

      // Add one extra inside the modal
      await modal.getByRole("button", { name: "Agregar Bebida Refresco" }).click();
      await modal.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(modal).not.toBeVisible();

      // Cart total = dish (350) + extra (75) = 425
      const totalContainer = page.locator("aside").getByText(/Total/i).locator("..");
      await expect(totalContainer).toContainText("425");

      // Submit without name -> validation error shown
      await page.getByRole("button", { name: "Enviar pedido" }).click();
      await expect(
        page.getByText("Por favor ingresa tu nombre (entre 2 y 80 caracteres)."),
      ).toBeVisible();

      // Fill "Tu nombre"
      await page.getByLabel("Tu nombre").fill("Ana García");

      // Submit again
      await page.getByRole("button", { name: "Enviar pedido" }).click();

      // Assert captured payload
      await expect.poll(() => capturedPayload).not.toBeNull();
      expect(capturedPayload!.p_token).toBe("e2e-token");
      expect(capturedPayload!.p_employee_name).toBe("Ana García");
      expect(capturedPayload!.p_items).toHaveLength(1);

      const dishItem = capturedPayload!.p_items![0];
      expect(dishItem.plato_id).toBe(101);
      expect(dishItem.quantity).toBe(1);
      expect(dishItem.extras).toBeDefined();
      expect(dishItem.extras).toHaveLength(1);
      expect(dishItem.extras![0].plato_id).toBe(201);
      expect(dishItem.extras![0].quantity).toBe(1);

      // NO price key anywhere in p_items
      const itemsJson = JSON.stringify(capturedPayload!.p_items);
      expect(itemsJson).not.toContain('"price"');

      // Success screen shows "Pedido #<n>"
      await expect(page.getByRole("heading", { name: /Pedido #42/i })).toBeVisible({ timeout: 10_000 });
    } finally {
      await closeApp(app, userDataDirectory);
    }
  });

  test("2. Link with extras NOT allowed: no 'Agregar extras' UI anywhere", async () => {
    const { app, page, userDataDirectory } = await launchLoggedOutApp();

    try {
      await page.route("**/rest/v1/tenants*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
      });

      const noExtrasFixture = {
        ...companyMenuFixture,
        allow_extras: false,
        extras: [],
      };

      await page.route("**/rest/v1/rpc/get_online_menu_status*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ open: true }),
        });
      });

      await page.route("**/rest/v1/rpc/get_menu_by_link*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(noExtrasFixture),
        });
      });

      await navigateToMenuLink(page, "no-extras-token");
      await expect(page.getByText(/Menú para Acme Corp/i)).toBeVisible({ timeout: 15_000 });

      // In the catalog and page, no "Agregar extras" UI exists
      await expect(page.getByText("Agregar extras")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /extras/i })).toHaveCount(0);

      // Adding the dish directly adds to cart without opening any extras modal
      await page.getByRole("button", { name: "Agregar Pollo al Horno al pedido" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // In the cart panel, still no extras UI
      await expect(page.getByText("Agregar extras")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /extras/i })).toHaveCount(0);
    } finally {
      await closeApp(app, userDataDirectory);
    }
  });

  test("3. Unavailable menu shows 'Este menú no está disponible en este momento.' and no dishes", async () => {
    const { app, page, userDataDirectory } = await launchLoggedOutApp();

    try {
      await page.route("**/rest/v1/tenants*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
      });

      const unavailableFixture = {
        available: false,
        reason: "MENU_NOT_AVAILABLE",
        label: null,
        link_type: "public",
        allow_extras: false,
        company_name: null,
        restaurant: null,
        items: [],
        extras: [],
      };

      await page.route("**/rest/v1/rpc/get_online_menu_status*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ open: true }),
        });
      });

      await page.route("**/rest/v1/rpc/get_menu_by_link*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(unavailableFixture),
        });
      });

      await navigateToMenuLink(page, "unavailable-token");

      // Verify unavailable message
      await expect(
        page.getByText("Este menú no está disponible en este momento."),
      ).toBeVisible({ timeout: 15_000 });

      // No dish cards or add buttons
      await expect(page.getByRole("article")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Agregar/i })).toHaveCount(0);
    } finally {
      await closeApp(app, userDataDirectory);
    }
  });

  test("4. Sold-out on submit: RPC error ITEM_SOLD_OUT displays notice and reloads menu", async () => {
    const { app, page, userDataDirectory } = await launchLoggedOutApp();

    try {
      await page.route("**/rest/v1/tenants*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
      });

      let getMenuCallCount = 0;
      await page.route("**/rest/v1/rpc/get_online_menu_status*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ open: true }),
        });
      });

      await page.route("**/rest/v1/rpc/get_menu_by_link*", async (route) => {
        getMenuCallCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(companyMenuFixture),
        });
      });

      await page.route("**/rest/v1/rpc/create_order_by_link*", async (route) => {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            code: "P0001",
            message: "ITEM_SOLD_OUT",
            details: null,
            hint: null,
          }),
        });
      });

      await navigateToMenuLink(page, "sold-out-token");
      await expect(page.getByText(/Menú para Acme Corp/i)).toBeVisible({ timeout: 15_000 });

      // Add dish to cart
      await page.getByRole("button", { name: "Agregar Pollo al Horno al pedido" }).click();
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible();
      await modal.getByRole("button", { name: "Agregar al pedido" }).click();
      await expect(modal).not.toBeVisible();

      // Fill name
      await page.getByLabel("Tu nombre").fill("Mario Rossi");

      // Submit order
      await page.getByRole("button", { name: "Enviar pedido" }).click();

      // Verify the user sees the sold-out message
      await expect(page.getByText(/se agotó/i)).toBeVisible({ timeout: 10_000 });

      // Verify the menu reloads (second get_menu_by_link call happens)
      await expect.poll(() => getMenuCallCount).toBeGreaterThanOrEqual(2);
    } finally {
      await closeApp(app, userDataDirectory);
    }
  });

  test("5. Closed restaurant: mocked closed status renders full-page notice with Reintentar button and no menu/cart", async () => {
    const { app, page, userDataDirectory } = await launchLoggedOutApp();
    try {
      await page.route("**/rest/v1/tenants*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
      });

      let isOpen = false;
      await page.route("**/rest/v1/rpc/get_online_menu_status*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ open: isOpen }),
        });
      });

      await page.route("**/rest/v1/rpc/get_menu_by_link*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(companyMenuFixture),
        });
      });

      await navigateToMenuLink(page, "closed-cycle-token");

      // Verify closed message and Reintentar button are visible
      await expect(
        page.getByText("Este restaurante no está trabajando en este momento. Por favor, vuelva en horario laboral.")
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();

      // Verify menu / dishes / cart are NOT rendered
      await expect(page.getByText("Pollo al Horno")).not.toBeVisible();
      await expect(page.getByRole("button", { name: "Enviar pedido" })).not.toBeVisible();

      // Now simulate opening the restaurant and clicking Reintentar
      isOpen = true;
      await page.getByRole("button", { name: "Reintentar" }).click();

      // Menu should flip and become visible
      await expect(page.getByText(/Menú para Acme Corp/i)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Pollo al Horno")).toBeVisible();
    } finally {
      await closeApp(app, userDataDirectory);
    }
  });
});
