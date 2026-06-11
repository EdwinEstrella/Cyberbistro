import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LOCAL_FIRST_HISTORY_TABLES,
  LOCAL_FIRST_IMMEDIATE_TABLES,
  LOCAL_FIRST_MIRROR_TABLES,
  isLocalFirstMirrorTable,
} from "../src/shared/lib/localFirst";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function collectFiles(dir: string, matcher: (filePath: string) => boolean): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, matcher));
      continue;
    }
    if (matcher(fullPath)) results.push(fullPath);
  }

  return results;
}

describe("fiscal security regression", () => {
  it("keeps dgii-ecf imports out of renderer and React code", () => {
    const rendererFiles = collectFiles(path.join(projectRoot, "src"), (filePath) => /\.(ts|tsx)$/.test(filePath));
    const offenders = rendererFiles.filter((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return /from\s+["']dgii-ecf["']|require\(\s*["']dgii-ecf["']\s*\)/.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it("does not persist certificate upload secrets in renderer storage code", () => {
    const uploaderSource = readFileSync(
      path.join(projectRoot, "src", "features", "ajustes", "components", "CertificateUploader.tsx"),
      "utf8"
    );

    expect(uploaderSource).toContain("useState<File | null>(null)");
    expect(uploaderSource).toContain('useState("")');
    expect(uploaderSource).not.toMatch(/localStorage|indexedDB/);
  });

  it("keeps certificate metadata out of local-first IndexedDB mirrors", () => {
    expect(LOCAL_FIRST_MIRROR_TABLES).not.toContain("ecf_certificate_metadata");
    expect(LOCAL_FIRST_IMMEDIATE_TABLES).not.toContain("ecf_certificate_metadata");
    expect(LOCAL_FIRST_HISTORY_TABLES).not.toContain("ecf_certificate_metadata");
    expect(isLocalFirstMirrorTable("ecf_certificate_metadata")).toBe(false);
  });
});
