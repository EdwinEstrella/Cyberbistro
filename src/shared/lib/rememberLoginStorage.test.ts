import { describe, expect, it } from "vitest";

import { consumeRememberedLogin, parseRememberedLogin } from "./rememberLoginStorage";

describe("remember login storage", () => {
  it("extracts only safe metadata from a legacy plaintext payload", () => {
    const result = parseRememberedLogin(
      JSON.stringify({ enabled: true, email: "owner@example.com", password: "secret-password" })
    );

    expect(result).toEqual({ email: "owner@example.com", hadLegacySecret: true });
    expect(JSON.stringify(result)).not.toContain("secret-password");
  });

  it("drops invalid or disabled remembered login payloads", () => {
    expect(parseRememberedLogin("not-json")).toEqual({ email: null, hadLegacySecret: false });
    expect(parseRememberedLogin(JSON.stringify({ enabled: false, email: "owner@example.com" }))).toEqual({
      email: "owner@example.com",
      hadLegacySecret: false,
    });
  });

  it("removes the legacy key before returning safe email metadata", () => {
    const removed: string[] = [];
    const storage = {
      getItem: () => JSON.stringify({ enabled: true, email: "owner@example.com", password: "secret-password" }),
      removeItem: (key: string) => removed.push(key),
    } as Pick<Storage, "getItem" | "removeItem">;

    expect(consumeRememberedLogin(storage, "cloudix_remember_login")).toEqual({
      email: "owner@example.com",
      hadLegacySecret: true,
    });
    expect(removed).toEqual(["cloudix_remember_login"]);
  });
});
