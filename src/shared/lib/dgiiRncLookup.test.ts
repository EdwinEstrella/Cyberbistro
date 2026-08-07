import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("./insforge", () => ({
  insforgeClient: { functions: { invoke } },
}));

import { lookupBusinessByRnc } from "./dgiiRncLookup";

describe("lookupBusinessByRnc", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the Electron bridge instead of the unavailable function service", async () => {
    const lookupBusinessRnc = vi.fn().mockResolvedValue({
      data: {
        rnc: "101-00106-2",
        legalName: "CASA RODRIGUEZ SAS",
        tradeName: "CASA RODRIGUEZ",
        status: "ACTIVO",
      },
      error: null,
    });
    vi.stubGlobal("window", { electronAPI: { lookupBusinessRnc } });

    await expect(lookupBusinessByRnc("101001062")).resolves.toMatchObject({
      data: { legalName: "CASA RODRIGUEZ SAS" },
      error: null,
    });

    expect(lookupBusinessRnc).toHaveBeenCalledWith("101001062");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("normalizes a formatted RNC before calling the lookup function", async () => {
    invoke.mockResolvedValue({
      data: {
        rnc: "131-99603-5",
        legalName: "AGROPECUARIA DELIA & MILO AGRODEMI SRL",
        tradeName: "AGROPECUARIA DELIA & MILO AGRODEMI",
        status: "ACTIVO",
      },
      error: null,
    });

    const result = await lookupBusinessByRnc("131-99603-5");

    expect(invoke).toHaveBeenCalledWith("lookup-business-rnc", { body: { rnc: "131996035" } });
    expect(result).toEqual({
      data: {
        rnc: "131-99603-5",
        legalName: "AGROPECUARIA DELIA & MILO AGRODEMI SRL",
        tradeName: "AGROPECUARIA DELIA & MILO AGRODEMI",
        status: "ACTIVO",
      },
      error: null,
    });
  });

  it("rejects a value that is not a nine-digit RNC before making a request", async () => {
    await expect(lookupBusinessByRnc("001-0000-1")).resolves.toEqual({
      data: null,
      error: "Ingresá un RNC válido de 9 dígitos.",
    });

    expect(invoke).not.toHaveBeenCalled();
  });
});
