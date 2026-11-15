import { describe, expect, it } from "vitest";
import { isEcfRejectedStatus } from "./ecfRejection";

describe("isEcfRejectedStatus", () => {
  it.each(["rejected", "terminal_error", " Rejected ", "TERMINAL_ERROR"])("treats %j as rejected", (status) => {
    expect(isEcfRejectedStatus(status)).toBe(true);
  });

  it.each(["accepted", "accepted_conditional", "pending", "sent", "pending_offline", "error", "", null, undefined, 42])(
    "does not treat %j as rejected",
    (status) => {
      expect(isEcfRejectedStatus(status)).toBe(false);
    }
  );
});
