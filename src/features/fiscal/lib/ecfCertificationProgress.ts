/**
 * Pure helpers for persisting the DGII certification wizard progress (table
 * `ecf_certification_progress`, cloud-only: written straight to Supabase, not local-first).
 */

export const CERTIFICATION_TOTAL_STEPS = 15;
export const HIDDEN_CERTIFICATION_STEPS: readonly number[] = [];

export interface CertificationProgress {
  currentStep: number;
  completedSteps: number[];
}

export const INITIAL_CERTIFICATION_PROGRESS: CertificationProgress = { currentStep: 1, completedSteps: [] };

function isStep(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= CERTIFICATION_TOTAL_STEPS;
}

export function visibleCertificationSteps(): number[] {
  const steps: number[] = [];
  for (let i = 1; i <= CERTIFICATION_TOTAL_STEPS; i++) {
    if (!HIDDEN_CERTIFICATION_STEPS.includes(i)) {
      steps.push(i);
    }
  }
  return steps;
}

export function nextVisibleStep(id: number): number {
  const visible = visibleCertificationSteps();
  const next = visible.find((step) => step > id);
  return next ?? CERTIFICATION_TOTAL_STEPS;
}

export function displayStepNumber(id: number): number {
  const visible = visibleCertificationSteps();
  const index = visible.indexOf(id);
  if (index !== -1) {
    return index + 1;
  }
  const next = nextVisibleStep(id);
  const nextIndex = visible.indexOf(next);
  return nextIndex !== -1 ? nextIndex + 1 : visible.length;
}

/** Fails safe to step 1 for a missing, malformed or out-of-range row. */
export function restoreProgress(row: unknown): CertificationProgress {
  const raw = (row ?? {}) as { current_step?: unknown; completed_steps?: unknown };
  let currentStep = isStep(raw.current_step) ? raw.current_step : 1;
  if (HIDDEN_CERTIFICATION_STEPS.includes(currentStep)) {
    currentStep = nextVisibleStep(currentStep);
  }
  const completed = Array.isArray(raw.completed_steps)
    ? raw.completed_steps.filter(isStep).filter((step) => !HIDDEN_CERTIFICATION_STEPS.includes(step))
    : [];
  return { currentStep, completedSteps: [...new Set(completed)].sort((a, b) => a - b) };
}

/** Marks `step` as done and moves to the next visible step (never past the last step). */
export function advanceProgress(progress: CertificationProgress, step: number): CertificationProgress {
  if (!isStep(step)) return progress;
  const completedSteps = [...new Set([...progress.completedSteps, step])].sort((a, b) => a - b);
  return { currentStep: nextVisibleStep(step), completedSteps };
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
