import { getInsforgeResolvedBaseUrl } from "./insforge";

export type CloudCircuitState = "closed" | "open" | "half-open";

export interface CloudAvailabilitySnapshot {
  internetOnline: boolean;
  cloudAvailable: boolean;
  circuitState: CloudCircuitState;
  failures: number;
  lastOkAt: number | null;
  lastFailAt: number | null;
  nextProbeAt: number;
}

const PROBE_TIMEOUT_MS = 2_500;
const CLOSED_CACHE_MS = 15_000;
const OPEN_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000] as const;

let circuitState: CloudCircuitState = "closed";
let failures = 0;
let lastOkAt: number | null = null;
let lastFailAt: number | null = null;
let nextProbeAt = 0;
let inFlightProbe: Promise<boolean> | null = null;

export function isDesktopRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as Window & { electronAPI?: unknown }).electronAPI);
}

export function getCloudAvailabilitySnapshot(): CloudAvailabilitySnapshot {
  const internetOnline = typeof navigator === "undefined" ? true : navigator.onLine;
  return {
    internetOnline,
    cloudAvailable: !isDesktopRuntime() || (internetOnline && circuitState === "closed"),
    circuitState,
    failures,
    lastOkAt,
    lastFailAt,
    nextProbeAt,
  };
}

export function recordCloudSuccess(now = Date.now()): void {
  if (!isDesktopRuntime()) return;
  circuitState = "closed";
  failures = 0;
  lastOkAt = now;
  nextProbeAt = now + CLOSED_CACHE_MS;
}

export function recordCloudFailure(now = Date.now()): void {
  if (!isDesktopRuntime()) return;
  failures += 1;
  circuitState = "open";
  lastFailAt = now;
  const backoff = OPEN_BACKOFF_MS[Math.min(failures - 1, OPEN_BACKOFF_MS.length - 1)];
  nextProbeAt = now + backoff;
}

function getNumericStatus(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["status", "statusCode", "httpStatus"]) {
    const raw = record[key];
    if (typeof raw === "number") return raw;
    if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getErrorText(value: unknown): string {
  if (value instanceof Error) return `${value.name} ${value.message}`.toLowerCase();
  if (typeof value === "string") return value.toLowerCase();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return [record.name, record.message, record.details, record.hint, record.code]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
}

export function isCloudAvailabilityFailure(error: unknown): boolean {
  const status = getNumericStatus(error);
  if (status != null) {
    return status === 0 || status === 408 || status === 429 || status >= 500;
  }

  const text = getErrorText(error);
  if (!text) return false;

  return [
    "aborterror",
    "timeout",
    "timed out",
    "failed to fetch",
    "fetch failed",
    "networkerror",
    "network error",
    "network request failed",
    "connection refused",
    "econnrefused",
    "econnreset",
    "enotfound",
    "etimedout",
    "dns",
    "service unavailable",
    "bad gateway",
    "gateway timeout",
  ].some((needle) => text.includes(needle));
}

async function runCloudProbe(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(getInsforgeResolvedBaseUrl(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function probeCloudAvailability(force = false): Promise<boolean> {
  if (!isDesktopRuntime()) return true;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    circuitState = "open";
    nextProbeAt = Date.now();
    return false;
  }

  const now = Date.now();
  if (!force && circuitState === "closed" && now < nextProbeAt) return true;
  if (!force && circuitState === "open" && now < nextProbeAt) return false;
  if (inFlightProbe) return inFlightProbe;

  circuitState = circuitState === "open" ? "half-open" : circuitState;
  inFlightProbe = runCloudProbe().then((available) => {
    if (available) recordCloudSuccess();
    else recordCloudFailure();
    return available;
  }).finally(() => {
    inFlightProbe = null;
  });
  return inFlightProbe;
}

export async function isCloudAvailableForDesktop(): Promise<boolean> {
  return probeCloudAvailability(false);
}

export async function isDesktopCloudUnavailable(): Promise<boolean> {
  return isDesktopRuntime() && !(await probeCloudAvailability(false));
}
