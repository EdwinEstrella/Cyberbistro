import { describe, expect, it } from "vitest";
import {
  ECF_FISCAL_STATUSES,
  FISCAL_MODES,
  isEcfFiscalStatus,
  isFiscalMode,
  normalizeFiscalMode,
} from "./fiscalTypes";

describe("fiscalTypes", () => {
  it("defines the explicit fiscal modes accepted by tenant configuration", () => {
    expect(FISCAL_MODES).toEqual(["internal_receipt", "ncf_legacy", "dgii_ecf"]);
    expect(isFiscalMode("dgii_ecf")).toBe(true);
    expect(isFiscalMode("ncf")).toBe(false);
  });

  it("maps legacy NCF booleans when no explicit fiscal mode exists", () => {
    expect(normalizeFiscalMode(null, false)).toBe("internal_receipt");
    expect(normalizeFiscalMode(undefined, true)).toBe("ncf_legacy");
    expect(normalizeFiscalMode("not-a-mode", true)).toBe("ncf_legacy");
  });

  it("keeps e-CF lifecycle statuses separate from payment and generic sync states", () => {
    expect(ECF_FISCAL_STATUSES).toEqual([
      "pending_offline",
      "pending_sync",
      "queued",
      "signed",
      "submitted",
      "accepted",
      "rejected",
      "retryable_error",
      "terminal_error",
    ]);
    expect(isEcfFiscalStatus("accepted")).toBe(true);
    expect(isEcfFiscalStatus("pagada")).toBe(false);
    expect(isEcfFiscalStatus("synced")).toBe(false);
  });
});
