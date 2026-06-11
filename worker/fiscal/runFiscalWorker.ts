import { createFiscalWorkerRuntimeFromEnv } from "./fiscalWorkerRuntime";

const runtime = createFiscalWorkerRuntimeFromEnv();

process.once("SIGINT", () => runtime.stop());
process.once("SIGTERM", () => runtime.stop());

await runtime.runForever();
