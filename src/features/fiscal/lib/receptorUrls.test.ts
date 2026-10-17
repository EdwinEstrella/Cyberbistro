import { describe, expect, it } from "vitest";
import { buildReceptorUrls, ECF_RECEPTOR_BASE_URL, receptorRncSegment } from "./receptorUrls";

describe("buildReceptorUrls", () => {
  it("builds the DGII receptor URLs from the registered public base", () => {
    expect(buildReceptorUrls("133488485")).toEqual({
      base: "https://cloudix-ecf.azokia.com/133488485",
      authentication: "https://cloudix-ecf.azokia.com/133488485/fe/autenticacion/api/[semilla|ValidacionCertificado]",
      reception: "https://cloudix-ecf.azokia.com/133488485/fe/recepcion/api/ecf",
      approval: "https://cloudix-ecf.azokia.com/133488485/fe/aprobacioncomercial/api/ecf",
    });
  });

  it("strips dashes and spaces from the stored RNC", () => {
    expect(receptorRncSegment("1-33-48848-5")).toBe("133488485");
    expect(receptorRncSegment(" 402 1234 5678 ")).toBe("40212345678");
  });

  it("shows a placeholder instead of a broken URL when the RNC is missing", () => {
    expect(buildReceptorUrls("").reception).toBe(`${ECF_RECEPTOR_BASE_URL}/EMISOR/fe/recepcion/api/ecf`);
    expect(buildReceptorUrls(null).base).toBe(`${ECF_RECEPTOR_BASE_URL}/EMISOR`);
    expect(buildReceptorUrls(undefined).base).toBe(`${ECF_RECEPTOR_BASE_URL}/EMISOR`);
  });

  it("no longer references the placeholder host", () => {
    expect(JSON.stringify(buildReceptorUrls("133488485"))).not.toContain("api.cloudix.com");
  });
});
