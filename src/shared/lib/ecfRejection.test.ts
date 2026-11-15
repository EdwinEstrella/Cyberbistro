import { describe, expect, it } from "vitest";
import { isEcfAcceptedStatus, isEcfRejectedStatus } from "./ecfRejection";

describe("isEcfAcceptedStatus", () => {
  it.each(["accepted", "accepted_conditional", " Accepted "])("treats %j as accepted", (status) => {
    expect(isEcfAcceptedStatus(status)).toBe(true);
  });

  it.each(["pending", "sent", "rejected", "terminal_error", "pending_offline", "", null, undefined])(
    "does not treat %j as accepted",
    (status) => {
      expect(isEcfAcceptedStatus(status)).toBe(false);
    }
  );
});

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
