import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function getTsFilesRecursively(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getTsFilesRecursively(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("dgii-ecf ESM imports in fiscal worker", () => {
  it("demonstrates that real Node ESM resolves dgii-ecf default export as object and named ECF as constructor function", () => {
    const script = [
      'import ECFDefault, { ECF as ECFNamed } from "dgii-ecf";',
      'const defaultType = typeof ECFDefault;',
      'const namedType = typeof ECFNamed;',
      'console.log(JSON.stringify({ defaultType, namedType }));',
      'try {',
      '  new ECFDefault();',
      '} catch (err) {',
      '  console.log("DEFAULT_CONSTRUCTOR_ERROR:" + err.message);',
      '}',
      'try {',
      '  new ECFNamed({ cert: "dummy", key: "dummy" }, "dev");',
      '  console.log("NAMED_CONSTRUCTOR_SUCCESS:true");',
      '} catch (err) {',
      '  console.log("NAMED_CONSTRUCTOR_ERROR:" + err.message);',
      '}',
    ].join("\n");

    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      { encoding: "utf8", cwd: process.cwd() }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"defaultType":"object"');
    expect(result.stdout).toContain('"namedType":"function"');
    expect(result.stdout).toContain("DEFAULT_CONSTRUCTOR_ERROR:ECFDefault is not a constructor");
    expect(result.stdout).toContain("NAMED_CONSTRUCTOR_SUCCESS:true");
  });

  it("asserts no .ts file under worker/ has a default import from dgii-ecf", () => {
    const workerDir = path.resolve(process.cwd(), "worker");
    const tsFiles = getTsFilesRecursively(workerDir);
    expect(tsFiles.length).toBeGreaterThan(0);

    const defaultDgiiEcfImportRegex =
      /import\s+[A-Za-z_$][\w$]*(?:\s+from|\s*,\s*[^;]*?\bfrom)\s*['"]dgii-ecf['"]/;

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, "utf8");
      const relativePath = path.relative(process.cwd(), file).replace(/\\/g, "/");
      expect(
        defaultDgiiEcfImportRegex.test(content),
        `Expected ${relativePath} not to have a default import from 'dgii-ecf'`
      ).toBe(false);
    }
  });
});
