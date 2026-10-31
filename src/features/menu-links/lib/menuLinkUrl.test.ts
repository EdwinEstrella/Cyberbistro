import { describe, expect, it } from "vitest";
import { buildMenuLinkUrl, resolveMenuBaseOrigin, DEFAULT_PRODUCTION_WEB_ORIGIN } from "./menuLinkUrl";

describe("menuLinkUrl", () => {
  it("builds the expected link URL format with explicit origin", () => {
    const url = buildMenuLinkUrl("xyz-token-123", "https://cyberbistro.example.com");
    expect(url).toBe("https://cyberbistro.example.com/#/menu/c/xyz-token-123");
  });

  it("trims trailing slashes from origin", () => {
    const url = buildMenuLinkUrl("token-abc", "https://example.com///");
    expect(url).toBe("https://example.com/#/menu/c/token-abc");
  });

  it("encodes special characters in token", () => {
    const url = buildMenuLinkUrl("token with spaces&stuff", "https://example.com");
    expect(url).toBe("https://example.com/#/menu/c/token%20with%20spaces%26stuff");
  });

  it("resolves desktop to production origin if electronAPI is present", () => {
    const fakeWindow = {
      electronAPI: {},
      location: { protocol: "http:", origin: "http://localhost:5173" },
    } as unknown as Window;

    expect(resolveMenuBaseOrigin(fakeWindow)).toBe(DEFAULT_PRODUCTION_WEB_ORIGIN);
  });

  it("resolves file: protocol to production origin", () => {
    const fakeWindow = {
      location: { protocol: "file:", origin: "null" },
    } as unknown as Window;

    expect(resolveMenuBaseOrigin(fakeWindow)).toBe(DEFAULT_PRODUCTION_WEB_ORIGIN);
  });

  it("uses window.location.origin in normal browser web runtime", () => {
    const fakeWindow = {
      location: { protocol: "https:", origin: "https://my-bistro.com" },
    } as unknown as Window;

    expect(resolveMenuBaseOrigin(fakeWindow)).toBe("https://my-bistro.com");
  });
});
