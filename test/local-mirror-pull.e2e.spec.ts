import { test, expect, chromium, type Browser, type Page } from "@playwright/test";
import { build } from "esbuild";

let browser: Browser;
let page: Page;
let bundle: string;

test.beforeAll(async () => {
  bundle = (await build({ entryPoints: ["src/shared/lib/localFirst.ts"], bundle: true, write: false,
    format: "iife", globalName: "syncTest", platform: "browser",
    define: { "import.meta.env": JSON.stringify({ VITE_SUPABASE_URL: "http://sync.test", VITE_SUPABASE_PUBLISHABLE_KEY: "test-key" }) },
  })).outputFiles[0].text;
  browser = await chromium.launch({ channel: "chrome", headless: true });
});
test.afterAll(async () => { await browser?.close(); });
test.beforeEach(async () => {
  page = await browser.newPage();
  await page.route("http://sync.test/**", route => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await page.goto("http://sync.test/");
  await page.addScriptTag({ content: bundle });
});
test.afterEach(async () => { await page.close(); });

test("cycle download preserves a pending close, downloads unrelated cycles, and propagates deletion", async () => {
  const result = await page.evaluate(async () => {
    const api = (window as any).syncTest;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("cycles-test", 1);
      request.onupgradeneeded = () => {
        for (const store of ["cierres_operativos", "sync_outbox", "local_fiscal_outbox"]) request.result.createObjectStore(store, { keyPath: "id" });
        request.result.createObjectStore("sync_state", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["cierres_operativos", "sync_outbox"], "readwrite");
      tx.objectStore("cierres_operativos").put({ id: "cycle-106", tenant_id: "t", cycle_number: 106, closed_at: "2026-09-15T22:00:00Z" });
      tx.objectStore("sync_outbox").put({ id: "close-106", table_name: "cierres_operativos", row_id: "cycle-106", status: "pending" });
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    const state = api.createSyncStateRow({ tenantId: "t", tableName: "cierres_operativos", phase: "incremental", completed: true, rowCount: 2, cursor: "first" });
    const read = (table: string) => new Promise<any[]>(resolve => {
      const req = db.transaction(table).objectStore(table).getAll(); req.onsuccess = () => resolve(req.result);
    });
    await api.applyMirrorPull(db, "t", "cierres_operativos", [
      { id: "cycle-106", tenant_id: "t", cycle_number: 106, closed_at: null },
      { id: "cycle-107", tenant_id: "t", cycle_number: 107, closed_at: null },
    ], state, true);
    const first = await read("cierres_operativos");
    await api.applyMirrorPull(db, "t", "cierres_operativos", [], { ...state, cursor: "empty" }, true);
    const afterDelete = await read("cierres_operativos");
    const outbox = await read("sync_outbox");
    db.close(); return { first, afterDelete, outbox };
  });
  expect(result.first).toEqual([
    { id: "cycle-106", tenant_id: "t", cycle_number: 106, closed_at: "2026-09-15T22:00:00Z" },
    { id: "cycle-107", tenant_id: "t", cycle_number: 107, closed_at: null },
  ]);
  expect(result.afterDelete).toEqual([result.first[0]]);
  expect(result.outbox).toHaveLength(1);
});

test("a failed IndexedDB transaction cannot replace cycles or advance the cursor", async () => {
  const result = await page.evaluate(async () => {
    const api = (window as any).syncTest;
    await api.readLocalMirror("rollback", "cierres_operativos");
    const db = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open(api.getLocalFirstDatabaseName("rollback"), api.LOCAL_FIRST_DB_VERSION);
      request.onsuccess = () => resolve(request.result);
    });
    const state = api.createSyncStateRow({ tenantId: "rollback", tableName: "cierres_operativos", phase: "incremental", completed: true, rowCount: 1, cursor: "original" });
    await api.applyMirrorPull(db, "rollback", "cierres_operativos", [{ id: "cycle-1", cycle_number: 1 }], state, true);
    let failed = false;
    try { await api.applyMirrorPull(db, "rollback", "cierres_operativos", [{ invalid: "missing primary key" }], { ...state, cursor: "bad" }, true); }
    catch { failed = true; }
    const savedState = await new Promise<any>(resolve => {
      const request = db.transaction("sync_state").objectStore("sync_state").get(state.key); request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return { failed, savedState, rows: await api.readLocalMirror("rollback", "cierres_operativos") };
  });
  expect(result.failed).toBe(true);
  expect(result.savedState.cursor).toBe("original");
  expect(result.rows).toEqual([{ id: "cycle-1", cycle_number: 1 }]);
});

test("all registered modules download even if an earlier table fails, including paginated cycles and empty deletions", async () => {
  let empty = false;
  const requested = new Set<string>();
  await page.route("http://sync.test/rest/v1/**", route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").at(-1)!; requested.add(table);
    if (table === "tenant_users") return route.fulfill({ status: 403, json: { message: "fixture denied" } });
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const rows = empty ? [] : table === "cierres_operativos"
      ? Array.from({ length: 601 }, (_, i) => ({ id: `cycle-${String(i).padStart(4, "0")}`, tenant_id: "all", cycle_number: i + 1, closed_at: "2026-09-15T22:00:00Z" }))
      : [{ id: table === "tenants" ? "all" : `${table}-1`, tenant_id: "all" }];
    return route.fulfill({ json: rows.slice(offset, offset + 250) });
  });
  const result = await page.evaluate(async () => {
    const api = (window as any).syncTest;
    let error = ""; try { await api.syncIncremental("all"); } catch (e) { error = String(e); }
    return { error, tables: api.LOCAL_FIRST_MIRROR_TABLES, cycles: await api.readLocalMirror("all", "cierres_operativos"), payroll: await api.readLocalMirror("all", "nomina_pagos") };
  });
  expect(result.error).toContain("tenant_users");
  expect([...requested].sort()).toEqual([...result.tables].sort());
  expect(result.cycles).toHaveLength(601);
  expect(result.payroll).toHaveLength(1);
  empty = true;
  const deleted = await page.evaluate(async () => {
    const api = (window as any).syncTest;
    let notified = false; window.addEventListener("local-mirror-updated", () => { notified = true; }, { once: true });
    await api.refreshFullTableMirror("all", "cierres_operativos");
    try { await api.syncIncremental("all"); } catch { /* expected fixture denial */ }
    return { notified, rows: await api.readLocalMirror("all", "cierres_operativos") };
  });
  expect(deleted).toEqual({ notified: true, rows: [] });
});
