import { createFiscalWorkerRuntimeFromEnv } from "./fiscalWorkerRuntime";

const runtime = createFiscalWorkerRuntimeFromEnv(process.env, {
  onError: (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[fiscal-worker] runtime error: ${message}`);
  },
});

process.once("SIGINT", () => runtime.stop());
process.once("SIGTERM", () => runtime.stop());

await runtime.runForever();
