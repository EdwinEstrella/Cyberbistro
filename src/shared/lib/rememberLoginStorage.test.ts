import { describe, expect, it } from "vitest";

import {
  parseRememberedLogin,
  serializeRememberedLogin,
} from "./rememberLoginStorage";

describe("remember login storage", () => {
  it("parses stored email and password", () => {
    const result = parseRememberedLogin(
      JSON.stringify({ enabled: true, email: "owner@example.com", password: "secret-password" })
    );

    expect(result).toEqual({ enabled: true, email: "owner@example.com", password: "secret-password", shouldPersist: true });
  });

  it("persists email and password when serializing remembered login data", () => {
    const serialized = serializeRememberedLogin("staff@example.com", "my-secret");

    expect(JSON.parse(serialized)).toEqual({ enabled: true, email: "staff@example.com", password: "my-secret" });
    expect(serialized).toContain("my-secret");
    expect(serialized).toContain("password");
  });

  it("drops invalid or disabled remembered login payloads", () => {
    expect(parseRememberedLogin("not-json")).toEqual({ enabled: false, shouldPersist: false });
    expect(parseRememberedLogin(JSON.stringify({ enabled: false, email: "owner@example.com" }))).toEqual({
      enabled: false,
      shouldPersist: false,
    });
  });
});
