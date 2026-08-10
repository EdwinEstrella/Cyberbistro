import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("local synthetic sync protocol", () => {
  it("proves the fixture-only rejection, idempotency, ordering, acknowledgement, timeout, and disabled-state contracts", () => {
    const output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/local-sync-postgres.ps1", "protocol"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output).toContain("local synthetic sync protocol validation passed");
  });
});
