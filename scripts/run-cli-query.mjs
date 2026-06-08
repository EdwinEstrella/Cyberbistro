import { spawnSync } from "node:child_process";
import fs from "node:fs";

const sql = fs.readFileSync("scripts/insert-demo-gastos.sql", "utf8");

const result = spawnSync("npx.cmd", ["insforge", "db", "query", sql], {
  encoding: "utf8",
  stdio: "inherit"
});

if (result.status !== 0) {
  console.error("Query failed");
  process.exit(1);
}
console.log("Success");
