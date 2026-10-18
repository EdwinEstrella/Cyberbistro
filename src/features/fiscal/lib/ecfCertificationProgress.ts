/**
 * Pure helpers for persisting the DGII certification wizard progress (table
 * `ecf_certification_progress`, cloud-only: written straight to Supabase, not local-first).
 */

export const CERTIFICATION_TOTAL_STEPS = 15;

export interface CertificationProgress {
  currentStep: number;
  completedSteps: number[];
}

export const INITIAL_CERTIFICATION_PROGRESS: CertificationProgress = { currentStep: 1, completedSteps: [] };

function isStep(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= CERTIFICATION_TOTAL_STEPS;
}

/** Fails safe to step 1 for a missing, malformed or out-of-range row. */
export function restoreProgress(row: unknown): CertificationProgress {
  const raw = (row ?? {}) as { current_step?: unknown; completed_steps?: unknown };
  const currentStep = isStep(raw.current_step) ? raw.current_step : 1;
  const completed = Array.isArray(raw.completed_steps) ? raw.completed_steps.filter(isStep) : [];
  return { currentStep, completedSteps: [...new Set(completed)].sort((a, b) => a - b) };
}

/** Marks `step` as done and moves to the next one (never past the last step). */
export function advanceProgress(progress: CertificationProgress, step: number): CertificationProgress {
  if (!isStep(step)) return progress;
  const completedSteps = [...new Set([...progress.completedSteps, step])].sort((a, b) => a - b);
  return { currentStep: Math.min(CERTIFICATION_TOTAL_STEPS, step + 1), completedSteps };
}

export function buildProgressUpsert(input: {
  tenantId: string;
  environment: string;
  progress: CertificationProgress;
  userId?: string | null;
  now?: Date;
}) {
  return {
    tenant_id: input.tenantId,
    environment: input.environment,
    current_step: input.progress.currentStep,
    completed_steps: input.progress.completedSteps,
    updated_at: (input.now ?? new Date()).toISOString(),
    updated_by: input.userId ?? null,
  };
}
