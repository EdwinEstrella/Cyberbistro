import { spawn } from "node:child_process";

const [, , query] = process.argv;

if (!query) {
  console.error("Usage: node scripts/run-insforge-mcp-sql.mjs <sql>");
  process.exit(1);
}

const apiKey = process.env.INSFORGE_MCP_API_KEY;
const apiBaseUrl = process.env.INSFORGE_MCP_API_BASE_URL;

if (!apiKey || !apiBaseUrl) {
  console.error("Missing INSFORGE_MCP_API_KEY or INSFORGE_MCP_API_BASE_URL.");
  process.exit(1);
}

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

let buffer = Buffer.alloc(0);
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  child.stdin.write(`Content-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

function parseMessages() {
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;

    const header = buffer.slice(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      throw new Error(`Invalid MCP header: ${header}`);
    }

    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) return;

    const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");
    buffer = buffer.slice(bodyEnd);
    const msg = JSON.parse(body);

    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }
}

child.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  parseMessages();
});

child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
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
  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "codex-sql-runner", version: "1.0.0" },
  });

  child.stdin.write(
    `Content-Length: ${Buffer.byteLength(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))}\r\n\r\n${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}`
  );

  const tools = await send("tools/list");
  const tool = tools.tools.find((t) => t.name === "run_raw_sql" || t.name === "run-raw-sql");
  if (!tool) {
    throw new Error(`run_raw_sql tool not found. Tools: ${tools.tools.map((t) => t.name).join(", ")}`);
  }

  const result = await send("tools/call", {
    name: tool.name,
    arguments: { query },
  });

  console.log(JSON.stringify(result, null, 2));
  child.stdin.end();
  child.kill();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  child.kill();
  process.exit(1);
}
