import { describe, expect, it } from "vitest";
import {
  NO_TEST_CERTIFICATE_MESSAGE,
  TEST_SEND_FALLBACK,
  buildSendTestRequest,
  buildTestStatusRequest,
  describeTestSendError,
  extractTestSendInvokeError,
  testEstadoView,
  toTestSendFailure,
  toTestSendResult,
} from "./ecfTestSend";

describe("requests", () => {
  it("always pin the test environment", () => {
    expect(buildSendTestRequest("t-1")).toEqual({ action: "send-test", environment: "test", tenantId: "t-1" });
    expect(buildSendTestRequest(null)).toEqual({ action: "send-test", environment: "test" });
    expect(buildTestStatusRequest("track-1", "t-1")).toEqual({ action: "test-status", environment: "test", trackId: "track-1", tenantId: "t-1" });
  });
});

describe("toTestSendResult", () => {
  it("maps a send-test body", () => {
    expect(
      toTestSendResult({ encf: "E310000000042", trackId: "tr", estado: "En Proceso", mensajes: [{ codigo: "0", valor: "ok" }, 5], codigoSeguridad: "AbC123", fechaFirma: "20-10-2026 10:30:00" }),
    ).toEqual({ encf: "E310000000042", trackId: "tr", estado: "En Proceso", mensajes: [{ codigo: "0", valor: "ok" }], codigoSeguridad: "AbC123", fechaFirma: "20-10-2026 10:30:00" });
  });

  it("keeps the eNCF and security code of the previous result on a status re-check", () => {
    const previous = toTestSendResult({ encf: "E310000000042", trackId: "tr", codigoSeguridad: "AbC123" });
    expect(toTestSendResult({ trackId: "tr", estado: "Aceptado", encf: null, mensajes: [] }, previous)).toMatchObject({
      encf: "E310000000042",
      estado: "Aceptado",
      codigoSeguridad: "AbC123",
    });
  });

  it("returns null without a trackId", () => {
    expect(toTestSendResult({ code: "DGII_REJECTED" })).toBeNull();
    expect(toTestSendResult(null)).toBeNull();
  });
});

describe("errors", () => {
  it("names the missing test certificate", () => {
    expect(describeTestSendError("CERTIFICATE_NOT_READY")).toBe(NO_TEST_CERTIFICATE_MESSAGE);
    expect(NO_TEST_CERTIFICATE_MESSAGE).toContain("Pruebas (TesteCF)");
    expect(describeTestSendError("WHATEVER")).toBe(TEST_SEND_FALLBACK);
    expect(describeTestSendError(undefined)).toBe(TEST_SEND_FALLBACK);
  });

  it("keeps the DGII messages of a rejection (mensajes or messages)", () => {
    expect(toTestSendFailure({ code: "DGII_REJECTED", encf: "E310000000042", mensajes: [{ codigo: "10", valor: "RNC inválido" }] })).toEqual({
      message: describeTestSendError("DGII_REJECTED"),
      code: "DGII_REJECTED",
      encf: "E310000000042",
      mensajes: [{ codigo: "10", valor: "RNC inválido" }],
    });
    expect(toTestSendFailure({ code: "DGII_ERROR", messages: [{ codigo: null, valor: "caído" }] }).mensajes).toEqual([{ codigo: null, valor: "caído" }]);
  });

  it("reads the body of a FunctionsHttpError", async () => {
    const error = { context: new Response(JSON.stringify({ code: "CERTIFICATE_NOT_READY" }), { status: 409 }) };
    expect(await extractTestSendInvokeError(error)).toMatchObject({ code: "CERTIFICATE_NOT_READY", message: NO_TEST_CERTIFICATE_MESSAGE });
    expect(await extractTestSendInvokeError(new Error("network"))).toEqual({ message: TEST_SEND_FALLBACK, mensajes: [] });
  });
});

describe("testEstadoView", () => {
  it("labels the DGII estados", () => {
    expect(testEstadoView("Aceptado")).toEqual({ label: "Aceptado", tone: "success", final: true });
    expect(testEstadoView("Aceptado Condicional")).toEqual({ label: "Aceptado condicional", tone: "warning", final: true });
    expect(testEstadoView("RECHAZADO")).toEqual({ label: "Rechazado", tone: "danger", final: true });
    expect(testEstadoView("En Proceso")).toEqual({ label: "En proceso", tone: "progress", final: false });
    expect(testEstadoView(null)).toEqual({ label: "En proceso", tone: "progress", final: false });
    expect(testEstadoView("No Encontrado").label).toBe("No encontrado");
  });
});
