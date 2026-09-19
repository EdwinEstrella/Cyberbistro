import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const dockerDesktopAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
// The protocol runner is a PowerShell script, so it only runs where powershell.exe
// exists (Windows). On Linux CI runners docker is present but powershell is not,
// so this must be part of the skip guard or spawnSync fails with ENOENT.
const powershellAvailable = spawnSync("powershell.exe", ["-NoProfile", "-Command", "exit 0"], { stdio: "ignore" }).status === 0;

describe("local synthetic sync protocol", () => {
  it.skipIf(!dockerDesktopAvailable || !powershellAvailable)("proves the fixture-only rejection, idempotency, ordering, acknowledgement, timeout, and disabled-state contracts", () => {
    const output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/local-sync-postgres.ps1", "protocol"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output).toContain("local synthetic sync protocol validation passed");
  });
});
