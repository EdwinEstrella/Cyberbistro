import type { ElectronApplication, Page } from "@playwright/test";

/** The app renderer loads from disk (packaged/e2e build) or from the Vite dev server. */
const APP_URL = /^(file|https?):/i;

/**
 * Resolves the main app window. `app.firstWindow()` is racy: main.ts prewarms a
 * hidden thermal-print window (`about:blank`) right after the main window, and
 * whichever target Playwright sees first wins — on slow CI runners that is often
 * the blank print window, so every locator times out.
 */
export async function mainWindow(
  app: Pick<ElectronApplication, "windows">,
  timeoutMs = 30_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const page = app.windows().find((candidate) => APP_URL.test(candidate.url()));
    if (page) return page;
    if (Date.now() >= deadline) {
      const urls = app.windows().map((candidate) => candidate.url());
      throw new Error(`Main app window did not load within ${timeoutMs}ms (windows: ${JSON.stringify(urls)})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
