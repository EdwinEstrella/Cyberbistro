import { describe, expect, it } from "vitest";
import type { Page } from "@playwright/test";
import { mainWindow } from "./support/electronMainWindow";

function fakeApp(urlsOverTime: string[][]) {
  let call = 0;
  return {
    windows: () => {
      const urls = urlsOverTime[Math.min(call, urlsOverTime.length - 1)];
      call += 1;
      return urls.map((url) => ({ url: () => url }) as unknown as Page);
    },
  };
}

describe("mainWindow", () => {
  it("skips the blank thermal-print window even when it opened first", async () => {
    const page = await mainWindow(fakeApp([["about:blank", "file:///C:/app/dist/index.html#/"]]));
    expect(page.url()).toBe("file:///C:/app/dist/index.html#/");
  });

  it("waits until the main window finishes navigating to the app", async () => {
    const page = await mainWindow(fakeApp([["about:blank"], ["about:blank", "about:blank"], ["about:blank", "http://localhost:5173/"]]));
    expect(page.url()).toBe("http://localhost:5173/");
  });

  it("fails with the open window URLs when the app never loads", async () => {
    await expect(mainWindow(fakeApp([["about:blank"]]), 150)).rejects.toThrow(/about:blank/);
  });
});
