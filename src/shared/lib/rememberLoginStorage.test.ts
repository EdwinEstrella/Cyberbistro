import { describe, expect, it } from "vitest";

import {
  parseRememberedLogin,
  serializeRememberedLogin,
} from "./rememberLoginStorage";

describe("remember login storage", () => {
  it("migrates legacy stored passwords by returning only the remembered email", () => {
    const result = parseRememberedLogin(
      JSON.stringify({ enabled: true, email: "owner@example.com", password: "secret-password" })
    );

    expect(result).toEqual({ enabled: true, email: "owner@example.com", shouldPersist: true });
  });

  it("does not persist passwords when serializing remembered login data", () => {
    const serialized = serializeRememberedLogin("staff@example.com", "ignored-secret");

    expect(JSON.parse(serialized)).toEqual({ enabled: true, email: "staff@example.com" });
    expect(serialized).not.toContain("ignored-secret");
    expect(serialized).not.toContain("password");
  });

  it("drops invalid or disabled remembered login payloads", () => {
    expect(parseRememberedLogin("not-json")).toEqual({ enabled: false, shouldPersist: false });
    expect(parseRememberedLogin(JSON.stringify({ enabled: false, email: "owner@example.com" }))).toEqual({
      enabled: false,
      shouldPersist: false,
    });
  });
});
