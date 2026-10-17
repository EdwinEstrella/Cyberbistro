/**
 * Pure e-CF activation readiness: single decision shared by the activation wizard and the
 * Ajustes fiscal-mode selector, so both entry points block (or allow) for the same reasons.
 */
import {
  evaluateCertificateHealth,
  formatCertificateHealth,
  type CertificateHealthMetadata,
} from "../../features/ajustes/lib/ecfCertificateHealth";
import { canUseFeature } from "./planFeatures";
import { validateEcfIssuer, type EcfIssuerInput } from "./ecfIssuerRequirements";
import { restoreRanges, validateEcfRange } from "./ecfSequenceRanges";

export type EcfEnvironmentId = "test" | "certification" | "production";

export const ECF_ENVIRONMENTS: readonly EcfEnvironmentId[] = ["test", "certification", "production"];

export const ECF_ENVIRONMENT_LABELS: Record<EcfEnvironmentId, string> = {
  test: "Pruebas (TesteCF)",
  certification: "Certificación (CerteCF)",
  production: "Producción (e-CF)",
};

export type EcfReadinessCode = "PLAN" | "ENVIRONMENT" | "ISSUER" | "CERTIFICATE" | "SEQUENCES";

export interface EcfReadinessIssue {
  code: EcfReadinessCode;
  message: string;
}

export interface EcfReadinessResult {
  ready: boolean;
  missing: EcfReadinessIssue[];
}

export interface EcfReadinessInput {
  plan: string | null | undefined;
  environment: string | null | undefined;
  issuer: EcfIssuerInput;
  /** Certificate metadata row for the SELECTED environment (null when none). */
  certificate: CertificateHealthMetadata | null | undefined;
  /** Persisted `ncf_secuencias_por_tipo` and `ecf_secuencias_rangos` (raw jsonb). */
  sequencesNextRaw: unknown;
  sequencesBoundsRaw: unknown;
  /** e-CF type codes the product supports (E31, E32, ...). */
  ecfTypeCodes: readonly string[];
  now?: Date;
}

export function isEcfEnvironment(value: unknown): value is EcfEnvironmentId {
  return typeof value === "string" && (ECF_ENVIRONMENTS as readonly string[]).includes(value);
}

export function evaluateEcfActivationReadiness(input: EcfReadinessInput): EcfReadinessResult {
  const missing: EcfReadinessIssue[] = [];

  if (!canUseFeature(input.plan, "dgii_ecf")) {
    missing.push({
      code: "PLAN",
      message: "Tu plan actual no incluye la facturación electrónica. Cambiá al Plan Profesional para activarla.",
    });
  }

  if (!isEcfEnvironment(input.environment)) {
    missing.push({
      code: "ENVIRONMENT",
      message: "Elegí el ambiente de la DGII (Pruebas, Certificación o Producción) antes de activar.",
    });
  }

  const issuer = validateEcfIssuer(input.issuer);
  if (!issuer.complete) {
    missing.push({
      code: "ISSUER",
      message: `${issuer.message} Completá los datos del emisor en el paso 1.`,
    });
  }

  const health = evaluateCertificateHealth({
    metadata: input.certificate,
    tenantRnc: input.issuer.rnc,
    selectedEnvironment: String(input.environment ?? ""),
    now: input.now,
  });
  if (health.status !== "ok" && !(health.status === "warning" && health.reason === "EXPIRING_SOON")) {
    missing.push({ code: "CERTIFICATE", message: formatCertificateHealth(health) });
  }

  const ranges = restoreRanges(input.ecfTypeCodes, input.sequencesNextRaw, input.sequencesBoundsRaw);
  const checks = Object.entries(ranges).map(([type, range]) => validateEcfRange(type, range));
  if (!checks.some((check) => check.valid)) {
    const firstError = checks.flatMap((check) => check.errors)[0];
    missing.push({
      code: "SEQUENCES",
      message: firstError
        ? `${firstError} Corregí las secuencias e-CF en el paso 3.`
        : "Configurá al menos un tipo de comprobante e-CF con su rango autorizado en el paso 3.",
    });
  }

  return { ready: missing.length === 0, missing };
}

/** Single Spanish text with every reason, for toasts and inline messages. */
export function formatReadinessIssues(result: EcfReadinessResult): string {
  return result.missing.map((issue) => issue.message).join(" ");
}

export type FiscalFallbackMode = "internal_receipt" | "ncf_legacy";

/** `fiscal_mode_fallback` values the app uses; anything else resolves to the default. */
export function normalizeFiscalFallback(raw: unknown): FiscalFallbackMode {
  return raw === "ncf_legacy" ? "ncf_legacy" : "internal_receipt";
}

export function buildActivationPayload(environment: EcfEnvironmentId, now: Date = new Date()) {
  // ncf_fiscal_activo: cloudix_reserve_ecf raises unless it is true, and Ajustes already derives it
  // as true for dgii_ecf (it is ignored by fiscalEngine/normalizeTenantBillingSettings in that mode).
  return { fiscal_mode: "dgii_ecf" as const, ecf_environment: environment, ncf_fiscal_activo: true, updated_at: now.toISOString() };
}

/** Back to the tenant's configured fallback (what fiscalEngine uses when e-CF cannot be issued). */
export function buildDeactivationPayload(fallbackRaw: unknown, now: Date = new Date()) {
  const fiscal_mode = normalizeFiscalFallback(fallbackRaw);
  // Mirrors Ajustes' derivation: the flag is true only for ncf_legacy or dgii_ecf.
  return { fiscal_mode, ncf_fiscal_activo: fiscal_mode === "ncf_legacy", updated_at: now.toISOString() };
}

export function describeActivationSuccess(environment: EcfEnvironmentId): string {
  return `Facturación electrónica activada en ${ECF_ENVIRONMENT_LABELS[environment]}. La emisión real a la DGII depende de que el servicio fiscal (worker) esté desplegado y en ejecución.`;
}

export type EcfSaveGateDecision = "allow" | "allow_with_warning" | "block";

export interface EcfSaveGate {
  decision: EcfSaveGateDecision;
  /** Spanish text for the block error or the non-blocking warning; null on plain allow. */
  message: string | null;
}

/**
 * Decides whether an Ajustes save may go on given the e-CF readiness.
 * - Not saving `dgii_ecf`: allow (readiness is irrelevant).
 * - Switching INTO `dgii_ecf` (previous persisted mode differs): block when not ready or when the
 *   readiness could not be read (fail closed).
 * - Already on `dgii_ecf`: never block (an expired certificate must not stop a logo change);
 *   warn with the reasons when not ready, and stay silent when the read itself failed.
 */
export function decideEcfSaveGate(args: {
  previousMode: unknown;
  nextMode: unknown;
  /** Readiness result, or null when it could not be read. */
  readiness: EcfReadinessResult | null;
}): EcfSaveGate {
  const { previousMode, nextMode, readiness } = args;
  if (nextMode !== "dgii_ecf") return { decision: "allow", message: null };
  const switchingIn = previousMode !== "dgii_ecf";
  if (switchingIn) {
    if (!readiness) return { decision: "block", message: "No se pudo verificar la configuración e-CF. Intentá de nuevo." };
    if (readiness.ready) return { decision: "allow", message: null };
    return { decision: "block", message: `No se puede activar la facturación electrónica. ${formatReadinessIssues(readiness)}` };
  }
  if (!readiness || readiness.ready) return { decision: "allow", message: null };
  return {
    decision: "allow_with_warning",
    message: `Configuración guardada, pero la facturación electrónica tiene pendientes. ${formatReadinessIssues(readiness)}`,
  };
}
