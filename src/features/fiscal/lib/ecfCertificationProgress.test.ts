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
  it("returns all 15 visible steps with none hidden", () => {
    expect(HIDDEN_CERTIFICATION_STEPS).toEqual([]);
    const visible = visibleCertificationSteps();
    expect(visible).toHaveLength(15);
    expect(visible).toContain(7);
    expect(visible).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });
});

describe("displayStepNumber and nextVisibleStep", () => {
  it("computes display step numbers matching internal step id for every step", () => {
    for (let id = 1; id <= CERTIFICATION_TOTAL_STEPS; id++) {
      expect(displayStepNumber(id)).toBe(id);
    }
  });

  it("computes nextVisibleStep correctly without skipping step 7", () => {
    expect(nextVisibleStep(6)).toBe(7);
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

  it("restores and keeps step 7 in current_step and completed_steps", () => {
    expect(restoreProgress({ current_step: 7 })).toEqual({ currentStep: 7, completedSteps: [] });
    expect(restoreProgress({ current_step: 6, completed_steps: [6, 7, 8] })).toEqual({ currentStep: 6, completedSteps: [6, 7, 8] });
    expect(restoreProgress({ current_step: 7, completed_steps: [6, 7, 8] })).toEqual({ currentStep: 7, completedSteps: [6, 7, 8] });
  });
});

describe("advanceProgress", () => {
  it("completes the step and moves to the next", () => {
    expect(advanceProgress({ currentStep: 1, completedSteps: [] }, 1)).toEqual({ currentStep: 2, completedSteps: [1] });
  });

  it("advances from step 6 to step 7 and from step 7 to step 8", () => {
    const from6 = advanceProgress({ currentStep: 6, completedSteps: [1, 2, 3, 4, 5] }, 6);
    expect(from6).toEqual({ currentStep: 7, completedSteps: [1, 2, 3, 4, 5, 6] });
    const from7 = advanceProgress(from6, 7);
    expect(from7).toEqual({ currentStep: 8, completedSteps: [1, 2, 3, 4, 5, 6, 7] });
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
