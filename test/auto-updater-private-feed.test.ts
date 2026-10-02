import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: { getFocusedWindow: vi.fn(), getAllWindows: vi.fn(() => []) }, ipcMain: { on: vi.fn(), handle: vi.fn() } }));
vi.mock("electron-updater", () => ({ autoUpdater: { on: vi.fn(), setFeedURL: vi.fn(), checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn() } }));
vi.mock("electron-log", () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), transports: { file: {} } } }));

import { buildPrivateReleasesFeed } from "../electron/autoUpdater";

describe("buildPrivateReleasesFeed", () => {
  it("keeps the packaged public feed when the build has no token", () => {
    expect(buildPrivateReleasesFeed(undefined)).toBeNull();
    expect(buildPrivateReleasesFeed("")).toBeNull();
    expect(buildPrivateReleasesFeed("   ")).toBeNull();
  });

  it("uses the authenticated GitHub feed of this repo when a token is embedded", () => {
    expect(buildPrivateReleasesFeed(" github_pat_abc ")).toEqual({
      provider: "github",
      owner: "EdwinEstrella",
      repo: "Cyberbistro",
      private: true,
      token: "github_pat_abc",
      releaseType: "release",
      vPrefixedTagName: true,
    });
  });
});
