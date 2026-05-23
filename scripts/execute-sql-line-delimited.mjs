import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const [, , sqlFilePath] = process.argv;

if (!sqlFilePath) {
  console.error("Usage: node scripts/execute-sql-line-delimited.mjs <path-to-sql-file>");
  process.exit(1);
}

const absoluteSqlPath = path.resolve(sqlFilePath);
if (!fs.existsSync(absoluteSqlPath)) {
  console.error(`SQL file not found at: ${absoluteSqlPath}`);
  process.exit(1);
}

const query = fs.readFileSync(absoluteSqlPath, "utf8");

const projectJsonPath = "C:\\Users\\Edwin\\Desktop\\Trabajos\\Cyberbistro\\.insforge\\project.json";
if (!fs.existsSync(projectJsonPath)) {
  console.error(`Project JSON not found at: ${projectJsonPath}`);
  process.exit(1);
}

const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, "utf8"));
const apiKey = projectJson.api_key;
const apiBaseUrl = projectJson.oss_host;

if (!apiKey || !apiBaseUrl) {
  console.error("Missing api_key or oss_host in project.json");
  process.exit(1);
}

console.log(`Executing SQL from ${absoluteSqlPath} against ${apiBaseUrl} using Line-Delimited JSON...`);

const child = spawn(
  "npx",
  [
    "-y",
    "@insforge/mcp@latest",
    "--api_key",
    apiKey,
    "--api_base_url",
    apiBaseUrl,
  ],
  {
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
  }
);

const rl = readline.createInterface({
  input: child.stdout,
  terminal: false,
});

let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  child.stdin.write(payload + "\n");
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  } catch (err) {
    console.error("Failed to parse message from MCP server:", line, err);
  }
});

child.stderr.on("data", (chunk) => {
  // Silence or print server startup logs
  const text = chunk.toString();
  if (text.includes("registered")) {
    console.log("Server status:", text.trim());
  }
});

child.on("exit", (code) => {
  if (pending.size > 0) {
    for (const { reject } of pending.values()) {
      reject(new Error(`MCP exited before response, code ${code}`));
    }
    pending.clear();
  }
});

try {
  // 1. Initialize
  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "codex-sql-runner", version: "1.0.0" },
  });

  // 2. Notify initialized
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  // 3. List tools
  const tools = await send("tools/list");
  const tool = tools.tools.find((t) => t.name === "run_raw_sql" || t.name === "run-raw-sql");
  if (!tool) {
    throw new Error(`run_raw_sql tool not found. Tools: ${tools.tools.map((t) => t.name).join(", ")}`);
  }

  // 4. Call run_raw_sql
  const result = await send("tools/call", {
    name: tool.name,
    arguments: { query },
  });

  console.log("SQL execution completed successfully!");
  console.log(JSON.stringify(result, null, 2));
  
  child.stdin.end();
  child.kill();
  process.exit(0);
} catch (error) {
  console.error("Execution failed:", error instanceof Error ? error.message : error);
  child.kill();
  process.exit(1);
}
