import { describe, expect, it } from "vitest";
import {
  CERTIFICATION_TOTAL_STEPS,
  INITIAL_CERTIFICATION_PROGRESS,
  advanceProgress,
  buildProgressUpsert,
  restoreProgress,
} from "./ecfCertificationProgress";

describe("restoreProgress", () => {
  it("restores a valid row", () => {
    expect(restoreProgress({ current_step: 4, completed_steps: [3, 1, 2, 2] })).toEqual({ currentStep: 4, completedSteps: [1, 2, 3] });
  });

  it("fails safe to step 1 for missing or malformed data", () => {
    expect(restoreProgress(null)).toEqual(INITIAL_CERTIFICATION_PROGRESS);
    expect(restoreProgress({ current_step: 99, completed_steps: "x" })).toEqual(INITIAL_CERTIFICATION_PROGRESS);
    expect(restoreProgress({ current_step: 2.5, completed_steps: [0, 16, "3", 5] })).toEqual({ currentStep: 1, completedSteps: [5] });
  });
});

describe("advanceProgress", () => {
  it("completes the step and moves to the next", () => {
    expect(advanceProgress({ currentStep: 1, completedSteps: [] }, 1)).toEqual({ currentStep: 2, completedSteps: [1] });
  });

  it("is idempotent for completed steps and clamps at the last step", () => {
    const last = advanceProgress({ currentStep: 15, completedSteps: [14] }, 15);
    expect(last).toEqual({ currentStep: CERTIFICATION_TOTAL_STEPS, completedSteps: [14, 15] });
    expect(advanceProgress(last, 15)).toEqual(last);
  });

  it("ignores invalid steps", () => {
    const progress = { currentStep: 3, completedSteps: [1, 2] };
    expect(advanceProgress(progress, 0)).toBe(progress);
  });
});

describe("buildProgressUpsert", () => {
  it("maps to the table columns", () => {
    expect(
      buildProgressUpsert({
        tenantId: "t",
        environment: "certification",
        progress: { currentStep: 3, completedSteps: [1, 2] },
        userId: "u",
        now: new Date("2026-10-18T12:00:00Z"),
      }),
    ).toEqual({
      tenant_id: "t",
      environment: "certification",
      current_step: 3,
      completed_steps: [1, 2],
      updated_at: "2026-10-18T12:00:00.000Z",
      updated_by: "u",
    });
  });
});
