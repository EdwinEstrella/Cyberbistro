import { describe, expect, it } from "vitest";
import {
  CERTIFICATION_TOTAL_STEPS,
  HIDDEN_CERTIFICATION_STEPS,
  INITIAL_CERTIFICATION_PROGRESS,
  advanceProgress,
  buildProgressUpsert,
  displayStepNumber,
  nextVisibleStep,
  restoreProgress,
  visibleCertificationSteps,
} from "./ecfCertificationProgress";

describe("visibleCertificationSteps", () => {
  it("returns 14 visible steps excluding hidden step 7", () => {
    expect(HIDDEN_CERTIFICATION_STEPS).toEqual([7]);
    const visible = visibleCertificationSteps();
    expect(visible).toHaveLength(14);
    expect(visible).not.toContain(7);
    expect(visible).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15]);
  });
});

describe("displayStepNumber and nextVisibleStep", () => {
  it("computes display step numbers correctly with hidden step 7", () => {
    expect(displayStepNumber(1)).toBe(1);
    expect(displayStepNumber(6)).toBe(6);
    expect(displayStepNumber(8)).toBe(7);
    expect(displayStepNumber(15)).toBe(14);
    expect(displayStepNumber(7)).toBe(7); // Next visible step (8) has display number 7
  });

  it("computes nextVisibleStep correctly skipping hidden steps", () => {
    expect(nextVisibleStep(6)).toBe(8);
    expect(nextVisibleStep(7)).toBe(8);
    expect(nextVisibleStep(8)).toBe(9);
    expect(nextVisibleStep(14)).toBe(15);
    expect(nextVisibleStep(15)).toBe(15);
  });
});

describe("restoreProgress", () => {
  it("restores a valid row", () => {
    expect(restoreProgress({ current_step: 4, completed_steps: [3, 1, 2, 2] })).toEqual({ currentStep: 4, completedSteps: [1, 2, 3] });
  });

  it("fails safe to step 1 for missing or malformed data", () => {
    expect(restoreProgress(null)).toEqual(INITIAL_CERTIFICATION_PROGRESS);
    expect(restoreProgress({ current_step: 99, completed_steps: "x" })).toEqual(INITIAL_CERTIFICATION_PROGRESS);
    expect(restoreProgress({ current_step: 2.5, completed_steps: [0, 16, "3", 5] })).toEqual({ currentStep: 1, completedSteps: [5] });
  });

  it("moves restored hidden current_step to the next visible step and drops hidden completed steps", () => {
    expect(restoreProgress({ current_step: 7 })).toEqual({ currentStep: 8, completedSteps: [] });
    expect(restoreProgress({ current_step: 6, completed_steps: [6, 7, 8] })).toEqual({ currentStep: 6, completedSteps: [6, 8] });
    expect(restoreProgress({ current_step: 7, completed_steps: [6, 7, 8] })).toEqual({ currentStep: 8, completedSteps: [6, 8] });
  });
});

describe("advanceProgress", () => {
  it("completes the step and moves to the next", () => {
    expect(advanceProgress({ currentStep: 1, completedSteps: [] }, 1)).toEqual({ currentStep: 2, completedSteps: [1] });
  });

  it("skips hidden step 7 when advancing from step 6", () => {
    const from6 = advanceProgress({ currentStep: 6, completedSteps: [1, 2, 3, 4, 5] }, 6);
    expect(from6).toEqual({ currentStep: 8, completedSteps: [1, 2, 3, 4, 5, 6] });
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
