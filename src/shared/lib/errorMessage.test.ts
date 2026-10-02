import { describe, expect, it } from "vitest";
import { describeError } from "./errorMessage";

describe("describeError", () => {
  it("reads Error.message", () => {
    expect(describeError(new Error("boom"), "fb")).toBe("boom");
  });
  it("reads message from plain objects (Supabase errors)", () => {
    expect(describeError({ message: "TypeError: Failed to fetch", code: "" }, "fb")).toBe("TypeError: Failed to fetch");
  });
  it("returns strings as-is", () => {
    expect(describeError("plain", "fb")).toBe("plain");
  });
  it("falls back for unknown shapes and never yields [object Object]", () => {
    expect(describeError({ code: 1 }, "fb")).toBe("fb");
    expect(describeError({ message: "" }, "fb")).toBe("fb");
    expect(describeError(null, "fb")).toBe("fb");
    expect(describeError(undefined, "fb")).toBe("fb");
    expect(describeError(42, "fb")).toBe("fb");
  });
});
