import { readLocalMirror } from "./localFirst";
import { supabase } from "./supabase";
import { toast } from "sonner";
import { printLocalInvoiceReceipt } from "./localInvoiceReceipt";
import { enqueueThermalPrint, type PrintThermalResult } from "./thermalPrint";
import { isCreditNoteInvoice } from "./invoiceKind";
import { readLocalInvoices } from "../../features/billing/lib/invoicesLocal";

export const FISCAL_GATE_WAITING_MESSAGE = "Esperando código de la DGII para imprimir el comprobante…";
export const FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE =
  "El comprobante se imprimirá cuando la DGII lo confirme. Podés reimprimirlo desde Historial / Notas de crédito.";

export const DEFAULT_POLL_DELAYS = [
  2000, 3000, 5000, 5000, 5000, 5000, 5000, 10000, 10000, 10000,
  15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000,
];

export interface EcfDocumentState {
  status?: string | null;
  dgii_status?: string | null;
  dgii_security_code?: string | null;
  dgii_status_message?: string | null;
  dgii_track_id?: string | null;
  submitted_at?: string | null;
  accepted_at?: string | null;
  last_error?: string | null;
  [key: string]: unknown;
}

export interface FiscalPrintRequest {
  tenantId: string;
  factura: Record<string, unknown>;
  numeroFactura: number;
  ecfDocument?: Record<string, unknown> | null;
  isReprint?: boolean;
}

export interface FiscalPrintGateDependencies {
  isEcf: (factura: Record<string, unknown>) => boolean;
  checkLocalMirror: (tenantId: string, facturaId: string) => Promise<EcfDocumentState | null>;
  checkCloud: (tenantId: string, facturaId: string) => Promise<EcfDocumentState | null>;
  triggerSync: () => Promise<void>;
  printReceipt: (args: {
    tenantId: string;
    factura: Record<string, unknown>;
    numeroFactura: number;
    ecfDocument: EcfDocumentState | null;
  }) => Promise<PrintThermalResult>;
  showWaitingNotice: (message: string) => () => void;
  showMessage: (message: string, type?: "info" | "error") => void;
  isOnline: () => boolean;
  sleep: (ms: number) => Promise<void>;
  pollDelays: number[];
  backgroundPollIntervalMs?: number;
}

export interface FiscalGateResult {
  printed: boolean;
  queuedForBackground?: boolean;
  error?: string;
  reason?:
    | "not_ecf"
    | "already_ready"
    | "code_arrived"
    | "rejected"
    | "timeout"
    | "offline"
    | "duplicate"
    | "reprint_pending";
}

export function isEcfInvoiceDocument(factura: Record<string, unknown>): boolean {
  if (factura.fiscal_mode === "dgii_ecf") return true;
  const ncf = String(factura.ncf ?? "").trim();
  if (/^E\d{2}/i.test(ncf)) return true;
  const ncfTipo = String(factura.ncf_tipo ?? "").trim();
  if (/^E\d{2}/i.test(ncfTipo)) return true;
  if (isCreditNoteInvoice(factura) && /^E/i.test(ncf)) return true;
  return false;
}

export function extractSecurityCode(doc: Record<string, unknown> | null | undefined): string | null {
  if (!doc) return null;
  const code = (doc.dgii_security_code as string) ?? (doc.ecf_security_code as string) ?? null;
  if (typeof code === "string" && code.trim().length > 0) {
    return code.trim();
  }
  return null;
}

export function isRejectedEcf(doc: Record<string, unknown> | null | undefined): boolean {
  if (!doc) return false;
  return doc.dgii_status === "rejected" || doc.status === "rejected";
}

export function getRejectionMessage(doc: Record<string, unknown> | null | undefined): string {
  if (!doc) return "Comprobante rechazado por la DGII.";
  const msg =
    (doc.dgii_status_message as string) ||
    (doc.last_error as string) ||
    (doc.error as string) ||
    "Comprobante rechazado por la DGII.";
  return msg;
}

// In-memory queues to prevent duplicates and retry when confirmed
const activeJobs = new Set<string>();
const backgroundQueue = new Map<
  string,
  { request: FiscalPrintRequest; deps: FiscalPrintGateDependencies }
>();
let backgroundIntervalId: ReturnType<typeof setInterval> | null = null;

export function clearFiscalPrintQueue(): void {
  activeJobs.clear();
  backgroundQueue.clear();
  if (backgroundIntervalId) {
    clearInterval(backgroundIntervalId);
    backgroundIntervalId = null;
  }
}

export function getFiscalPrintBackgroundQueue(): Map<
  string,
  { request: FiscalPrintRequest; deps: FiscalPrintGateDependencies }
> {
  return backgroundQueue;
}

export async function defaultCheckLocal(tenantId: string, facturaId: string): Promise<EcfDocumentState | null> {
  try {
    const docs = await readLocalMirror<EcfDocumentState & { factura_id?: string }>(tenantId, "ecf_documents").catch(() => []);
    return docs.find((d) => d.factura_id === facturaId) ?? null;
  } catch {
    return null;
  }
}

export async function lookupEcfDocument(tenantId: string, facturaId: string): Promise<EcfDocumentState | null> {
  const local = await defaultCheckLocal(tenantId, facturaId);
  if (local) return local;
  return defaultCheckCloud(tenantId, facturaId);
}

export async function defaultCheckCloud(tenantId: string, facturaId: string): Promise<EcfDocumentState | null> {
  try {
    const { data, error } = await supabase
      .from("ecf_documents")
      .select("status, dgii_security_code, dgii_status_code, dgii_status_message, dgii_track_id, submitted_at, accepted_at, rejected_at, last_error")
      .eq("tenant_id", tenantId)
      .eq("factura_id", facturaId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    return {
      ...row,
      dgii_status: (row.status as string) ?? null,
    } as EcfDocumentState;
  } catch {
    return null;
  }
}

async function defaultTriggerSync(): Promise<void> {
  try {
    if (typeof window !== "undefined" && window.electronAPI?.triggerSync) {
      await window.electronAPI.triggerSync();
    }
  } catch {}
}

async function hydrateFacturaIfNeeded(
  tenantId: string,
  factura: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (factura.items && Array.isArray(factura.items) && factura.items.length > 0) {
    return factura;
  }
  const facturaId = String(factura.id ?? "");
  if (!facturaId) return factura;

  try {
    const localFacturas = await readLocalInvoices(tenantId).catch(() => []);
    const local = localFacturas.find((f: any) => f.id === facturaId);
    if (local && Array.isArray(local.items) && local.items.length > 0) {
      return { ...factura, ...local };
    }
  } catch {}

  try {
    const { data, error } = await supabase.from("facturas").select("*").eq("tenant_id", tenantId).eq("id", facturaId).maybeSingle();
    if (!error && data) {
      return { ...factura, ...data };
    }
  } catch {}

  return factura;
}

async function defaultPrintReceipt(args: {
  tenantId: string;
  factura: Record<string, unknown>;
  numeroFactura: number;
  ecfDocument: EcfDocumentState | null;
}): Promise<PrintThermalResult> {
  const fullFactura = await hydrateFacturaIfNeeded(args.tenantId, args.factura);
  const numFactura = args.numeroFactura || Number(fullFactura.numero_factura ?? 0);
  const printId = String(fullFactura.id ?? `factura-${numFactura}`);
  const label = isCreditNoteInvoice(fullFactura) ? `Nota de crédito #${numFactura}` : `Factura #${numFactura}`;

  return new Promise<PrintThermalResult>((resolve) => {
    const queued = enqueueThermalPrint({
      id: printId,
      label,
      print: async () => {
        const result = await printLocalInvoiceReceipt({
          tenantId: args.tenantId,
          factura: fullFactura,
          numeroFactura: numFactura,
          ecfDocument: args.ecfDocument,
        });
        resolve(result);
        return result;
      },
    });
    if (!queued) {
      resolve({ ok: true });
    }
  });
}

function defaultShowWaitingNotice(message: string): () => void {
  const toastId = toast.info(message, { duration: Infinity });
  return () => {
    toast.dismiss(toastId);
  };
}

function defaultShowMessage(message: string, type: "info" | "error" = "info"): void {
  if (type === "error") {
    toast.error(message, { duration: 8000 });
  } else {
    toast.info(message, { duration: 8000 });
  }
}

function defaultIsOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveDependencies(injected?: Partial<FiscalPrintGateDependencies>): FiscalPrintGateDependencies {
  return {
    isEcf: injected?.isEcf ?? isEcfInvoiceDocument,
    checkLocalMirror: injected?.checkLocalMirror ?? defaultCheckLocal,
    checkCloud: injected?.checkCloud ?? defaultCheckCloud,
    triggerSync: injected?.triggerSync ?? defaultTriggerSync,
    printReceipt: injected?.printReceipt ?? defaultPrintReceipt,
    showWaitingNotice: injected?.showWaitingNotice ?? defaultShowWaitingNotice,
    showMessage: injected?.showMessage ?? defaultShowMessage,
    isOnline: injected?.isOnline ?? defaultIsOnline,
    sleep: injected?.sleep ?? defaultSleep,
    pollDelays: injected?.pollDelays ?? DEFAULT_POLL_DELAYS,
    backgroundPollIntervalMs: injected?.backgroundPollIntervalMs ?? 15000,
  };
}

export async function runBackgroundRetryOnce(
  depsOverride?: Partial<FiscalPrintGateDependencies>
): Promise<void> {
  if (backgroundQueue.size === 0) return;

  const entries = Array.from(backgroundQueue.entries());
  for (const [facturaId, job] of entries) {
    const deps = depsOverride ? resolveDependencies(depsOverride) : job.deps;

    // Trigger sync if online
    if (deps.isOnline()) {
      void deps.triggerSync().catch(() => undefined);
    }

    // 1. Check local mirror
    const localDoc = await deps.checkLocalMirror(job.request.tenantId, facturaId);
    if (localDoc) {
      if (isRejectedEcf(localDoc)) {
        backgroundQueue.delete(facturaId);
        deps.showMessage(getRejectionMessage(localDoc), "error");
        continue;
      }
      if (extractSecurityCode(localDoc)) {
        backgroundQueue.delete(facturaId);
        await deps.printReceipt({
          tenantId: job.request.tenantId,
          factura: job.request.factura,
          numeroFactura: job.request.numeroFactura,
          ecfDocument: localDoc,
        });
        continue;
      }
    }

    // 2. Check cloud if online
    if (deps.isOnline()) {
      const cloudDoc = await deps.checkCloud(job.request.tenantId, facturaId);
      if (cloudDoc) {
        if (isRejectedEcf(cloudDoc)) {
          backgroundQueue.delete(facturaId);
          deps.showMessage(getRejectionMessage(cloudDoc), "error");
          continue;
        }
        if (extractSecurityCode(cloudDoc)) {
          backgroundQueue.delete(facturaId);
          await deps.printReceipt({
            tenantId: job.request.tenantId,
            factura: job.request.factura,
            numeroFactura: job.request.numeroFactura,
            ecfDocument: cloudDoc,
          });
          continue;
        }
      }
    }
  }

  if (backgroundQueue.size === 0 && backgroundIntervalId) {
    clearInterval(backgroundIntervalId);
    backgroundIntervalId = null;
  }
}

function startBackgroundProcessor(deps: FiscalPrintGateDependencies): void {
  if (backgroundIntervalId) return;
  const interval = deps.backgroundPollIntervalMs ?? 15000;
  backgroundIntervalId = setInterval(() => {
    void runBackgroundRetryOnce();
  }, interval);
}

export async function gateFiscalPrint(
  request: FiscalPrintRequest,
  injectedDeps?: Partial<FiscalPrintGateDependencies>
): Promise<FiscalGateResult> {
  const deps = resolveDependencies(injectedDeps);
  const facturaId = String(request.factura.id ?? "");

  // Non e-CF receipts passthrough immediately
  if (!deps.isEcf(request.factura)) {
    const result = await deps.printReceipt({
      tenantId: request.tenantId,
      factura: request.factura,
      numeroFactura: request.numeroFactura,
      ecfDocument: (request.ecfDocument as EcfDocumentState) ?? null,
    });
    return {
      printed: result.ok,
      reason: "not_ecf",
      error: result.ok ? undefined : result.error,
    };
  }

  // Check if security code is already in the passed request
  const passedCode =
    extractSecurityCode(request.ecfDocument) ||
    extractSecurityCode(request.factura);
  if (passedCode) {
    const result = await deps.printReceipt({
      tenantId: request.tenantId,
      factura: request.factura,
      numeroFactura: request.numeroFactura,
      ecfDocument: (request.ecfDocument as EcfDocumentState) ?? null,
    });
    return {
      printed: result.ok,
      reason: "already_ready",
      error: result.ok ? undefined : result.error,
    };
  }

  // Prevent duplicate concurrent jobs for the same factura id
  if (facturaId) {
    if (activeJobs.has(facturaId) || backgroundQueue.has(facturaId)) {
      return { printed: false, reason: "duplicate" };
    }
    activeJobs.add(facturaId);
  }

  // Check local mirror immediately
  const initialLocal = facturaId
    ? await deps.checkLocalMirror(request.tenantId, facturaId)
    : null;
  if (initialLocal) {
    if (isRejectedEcf(initialLocal)) {
      if (facturaId) activeJobs.delete(facturaId);
      deps.showMessage(getRejectionMessage(initialLocal), "error");
      return {
        printed: false,
        reason: "rejected",
        error: getRejectionMessage(initialLocal),
      };
    }
    if (extractSecurityCode(initialLocal)) {
      if (facturaId) activeJobs.delete(facturaId);
      const resolvedDoc = request.ecfDocument
        ? ({ ...request.ecfDocument, ...initialLocal } as EcfDocumentState)
        : initialLocal;
      const result = await deps.printReceipt({
        tenantId: request.tenantId,
        factura: request.factura,
        numeroFactura: request.numeroFactura,
        ecfDocument: resolvedDoc,
      });
      return {
        printed: result.ok,
        reason: "already_ready",
        error: result.ok ? undefined : result.error,
      };
    }
  }

  // Manual reprint of an e-CF without security code: show message instead of printing
  if (request.isReprint) {
    if (facturaId && deps.isOnline()) {
      const initialCloud = await deps.checkCloud(request.tenantId, facturaId);
      if (initialCloud) {
        if (isRejectedEcf(initialCloud)) {
          if (facturaId) activeJobs.delete(facturaId);
          deps.showMessage(getRejectionMessage(initialCloud), "error");
          return {
            printed: false,
            reason: "rejected",
            error: getRejectionMessage(initialCloud),
          };
        }
        if (extractSecurityCode(initialCloud)) {
          if (facturaId) activeJobs.delete(facturaId);
          const resolvedDoc = request.ecfDocument
            ? ({ ...request.ecfDocument, ...initialCloud } as EcfDocumentState)
            : initialCloud;
          const result = await deps.printReceipt({
            tenantId: request.tenantId,
            factura: request.factura,
            numeroFactura: request.numeroFactura,
            ecfDocument: resolvedDoc,
          });
          return {
            printed: result.ok,
            reason: "already_ready",
            error: result.ok ? undefined : result.error,
          };
        }
      }
    }

    if (facturaId) activeJobs.delete(facturaId);
    deps.showMessage(FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE, "info");
    if (facturaId && !backgroundQueue.has(facturaId)) {
      backgroundQueue.set(facturaId, { request, deps });
      startBackgroundProcessor(deps);
    }
    return {
      printed: false,
      reason: "reprint_pending",
      error: FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE,
    };
  }

  // If offline at checkout: do not print, show notice, and queue for background retry
  if (!deps.isOnline()) {
    if (facturaId) {
      activeJobs.delete(facturaId);
      backgroundQueue.set(facturaId, { request, deps });
      startBackgroundProcessor(deps);
    }
    deps.showMessage(FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE, "info");
    return {
      printed: false,
      queuedForBackground: true,
      reason: "offline",
      error: FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE,
    };
  }

  // Online: show non-blocking toast and poll with backoff
  const dismissWaiting = deps.showWaitingNotice(FISCAL_GATE_WAITING_MESSAGE);
  void deps.triggerSync().catch(() => undefined);

  try {
    for (const delay of deps.pollDelays) {
      await deps.sleep(delay);

      void deps.triggerSync().catch(() => undefined);

      if (facturaId) {
        // Check local mirror first
        const localDoc = await deps.checkLocalMirror(request.tenantId, facturaId);
        if (localDoc) {
          if (isRejectedEcf(localDoc)) {
            dismissWaiting();
            if (facturaId) activeJobs.delete(facturaId);
            const msg = getRejectionMessage(localDoc);
            deps.showMessage(msg, "error");
            return { printed: false, reason: "rejected", error: msg };
          }
          if (extractSecurityCode(localDoc)) {
            dismissWaiting();
            if (facturaId) activeJobs.delete(facturaId);
            const result = await deps.printReceipt({
              tenantId: request.tenantId,
              factura: request.factura,
              numeroFactura: request.numeroFactura,
              ecfDocument: localDoc,
            });
            return {
              printed: result.ok,
              reason: "code_arrived",
              error: result.ok ? undefined : result.error,
            };
          }
        }

        // Check cloud if online
        if (deps.isOnline()) {
          const cloudDoc = await deps.checkCloud(request.tenantId, facturaId);
          if (cloudDoc) {
            if (isRejectedEcf(cloudDoc)) {
              dismissWaiting();
              if (facturaId) activeJobs.delete(facturaId);
              const msg = getRejectionMessage(cloudDoc);
              deps.showMessage(msg, "error");
              return { printed: false, reason: "rejected", error: msg };
            }
            if (extractSecurityCode(cloudDoc)) {
              dismissWaiting();
              if (facturaId) activeJobs.delete(facturaId);
              const result = await deps.printReceipt({
                tenantId: request.tenantId,
                factura: request.factura,
                numeroFactura: request.numeroFactura,
                ecfDocument: cloudDoc,
              });
              return {
                printed: result.ok,
                reason: "code_arrived",
                error: result.ok ? undefined : result.error,
              };
            }
          }
        }
      }
    }

    // Polling timed out (~3 minutes)
    dismissWaiting();
    if (facturaId) {
      activeJobs.delete(facturaId);
      backgroundQueue.set(facturaId, { request, deps });
      startBackgroundProcessor(deps);
    }
    deps.showMessage(FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE, "info");
    return {
      printed: false,
      queuedForBackground: true,
      reason: "timeout",
      error: FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE,
    };
  } catch (error) {
    dismissWaiting();
    if (facturaId) activeJobs.delete(facturaId);
    throw error;
  }
}
