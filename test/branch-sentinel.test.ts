import { describe, expect, it } from "vitest";
import { LOCAL_BRANCH_SENTINEL, toRemoteBranchId } from "../electron/persistence/branchSentinel";

describe("branchSentinel", () => {
  it("exports the expected local branch sentinel constant", () => {
    expect(LOCAL_BRANCH_SENTINEL).toBe("main-process-default");
  });

  describe("toRemoteBranchId", () => {
    it("returns trimmed branch string when valid and not sentinel", () => {
      expect(toRemoteBranchId("branch-1")).toBe("branch-1");
      expect(toRemoteBranchId("  branch-2  ")).toBe("branch-2");
      expect(toRemoteBranchId("f31ec4ec-1234-5678-abcd-ef0123456789")).toBe("f31ec4ec-1234-5678-abcd-ef0123456789");
    });

    it("returns null for the local process sentinel", () => {
      expect(toRemoteBranchId("main-process-default")).toBeNull();
      expect(toRemoteBranchId("  main-process-default  ")).toBeNull();
    });

    it("returns null for empty or whitespace-only strings", () => {
      expect(toRemoteBranchId("")).toBeNull();
      expect(toRemoteBranchId("   ")).toBeNull();
      expect(toRemoteBranchId("\t\n ")).toBeNull();
    });

    it("returns null for non-string types", () => {
      expect(toRemoteBranchId(null)).toBeNull();
      expect(toRemoteBranchId(undefined)).toBeNull();
      expect(toRemoteBranchId(12345)).toBeNull();
      expect(toRemoteBranchId({})).toBeNull();
      expect(toRemoteBranchId(["branch-1"])).toBeNull();
      expect(toRemoteBranchId(true)).toBeNull();
    });
  });
});
