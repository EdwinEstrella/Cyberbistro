import { expect, test, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("creates and lists expenses and categories in isolated profile with zero foreign key constraint errors", async () => {
  const userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-expenses-e2e-"));
  const tenantId = "tenant-e2e-expenses";

  const app = await electron.launch({ args: [".", `--user-data-dir=${userDataDirectory}`] });
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel("Correo")).toBeVisible();

    // 1. Verify IPC bridges are exposed
    await expect.poll(() => page.evaluate(() => ({
      hasExpenseCommand: typeof window.electronAPI?.executeExpenseCommand === "function",
      hasActivateTenant: typeof window.electronAPI?.activateTenant === "function",
      hasListExpenses: typeof window.electronAPI?.listExpenses === "function",
      hasListCategories: typeof window.electronAPI?.listExpenseCategories === "function",
    }))).toEqual({
      hasExpenseCommand: true,
      hasActivateTenant: true,
      hasListExpenses: true,
      hasListCategories: true,
    });

    // 2. Activate tenant store
    const activateRes = await page.evaluate((tid) => window.electronAPI!.activateTenant!(tid), tenantId);
    expect(activateRes.ok).toBe(true);
    expect(activateRes.data.tenantId).toBe(tenantId);

    // 3. Create category via IPC
    const catRes = await page.evaluate(() =>
      window.electronAPI!.executeExpenseCommand!({
        type: "expense.category.create",
        id: "cat-e2e-servicios",
        name: "Servicios Básicos",
        description: "Luz, agua, internet",
        color: "#10b981",
      })
    );
    expect(catRes.ok).toBe(true);

    // 4. Create expense with explicit category (must NOT throw FOREIGN KEY constraint failed)
    const expRes = await page.evaluate(() =>
      window.electronAPI!.executeExpenseCommand!({
        type: "expense.create",
        id: "exp-e2e-internet",
        categoryId: "cat-e2e-servicios",
        amount: 2500,
        description: "Factura Internet Claro",
        supplier: "Claro Dominicana",
        paymentMethod: "transfer",
        notes: "Mes de Septiembre",
      })
    );
    expect(expRes.ok).toBe(true);
    expect(expRes.data.localStatus).toBe("committed");

    // 5. Create expense with unknown/cloud category (must auto-heal foreign key and NOT fail)
    const unkCatExpRes = await page.evaluate(() =>
      window.electronAPI!.executeExpenseCommand!({
        type: "expense.create",
        id: "exp-e2e-cloud-cat",
        categoryId: "cat-cloud-unknown-uuid",
        amount: 800,
        description: "Gasto con categoría de la nube",
        supplier: "Ferretería",
        paymentMethod: "cash",
      })
    );
    expect(unkCatExpRes.ok).toBe(true);
    expect(unkCatExpRes.data.localStatus).toBe("committed");

    // 6. List categories and expenses from SQLite
    const listCats = await page.evaluate(() => window.electronAPI!.listExpenseCategories!());
    expect(listCats.ok).toBe(true);
    expect(listCats.data.some((c: any) => c.id === "cat-e2e-servicios")).toBe(true);

    const listExp = await page.evaluate(() => window.electronAPI!.listExpenses!());
    expect(listExp.ok).toBe(true);
    expect(listExp.data.some((e: any) => e.id === "exp-e2e-internet" && e.amount === 2500)).toBe(true);
    expect(listExp.data.some((e: any) => e.id === "exp-e2e-cloud-cat" && e.amount === 800)).toBe(true);

    // 7. Delete expense
    const delRes = await page.evaluate(() =>
      window.electronAPI!.executeExpenseCommand!({
        type: "expense.delete",
        id: "exp-e2e-internet",
      })
    );
    expect(delRes.ok).toBe(true);

    const afterDelList = await page.evaluate(() => window.electronAPI!.listExpenses!());
    expect(afterDelList.data.some((e: any) => e.id === "exp-e2e-internet")).toBe(false);
  } finally {
    await app.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
