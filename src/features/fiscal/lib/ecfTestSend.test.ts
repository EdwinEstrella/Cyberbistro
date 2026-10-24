import { describe, expect, it } from "vitest";
import {
  NO_TEST_CERTIFICATE_MESSAGE,
  TEST_SEND_FALLBACK,
  buildSendTestRequest,
  buildTestStatusRequest,
  TEST_POLL_MAX_TOTAL_MS,
  TEST_POLL_TIMEOUT_MESSAGE,
  describeTestSendError,
  formatDgiiMessages,
  nextTestPollStep,
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

describe("empty DGII messages", () => {
  it("toTestSendResult drops the DGII placeholder with an empty or blank valor", () => {
    const result = toTestSendResult({ trackId: "tr", estado: "En proceso", mensajes: [{ codigo: "0", valor: "" }, { codigo: "1", valor: "   " }, { codigo: "2", valor: "Algo" }] });
    expect(result?.mensajes).toEqual([{ codigo: "2", valor: "Algo" }]);
  });

  it("toTestSendFailure drops empty messages too", () => {
    expect(toTestSendFailure({ code: "DGII_ERROR", mensajes: [{ codigo: "0", valor: "" }] }).mensajes).toEqual([]);
  });

  it("formatDgiiMessages never prints a code without text", () => {
    expect(formatDgiiMessages([{ codigo: "0", valor: "" }])).toBe("");
    expect(formatDgiiMessages([{ codigo: "10", valor: "RNC inválido" }, { codigo: null, valor: "otro" }])).toBe("10: RNC inválido · otro");
  });
});

describe("nextTestPollStep", () => {
  it("is done as soon as the estado is final", () => {
    expect(nextTestPollStep({ estado: "Aceptado", attempt: 0, elapsedMs: 0 })).toEqual({ action: "done" });
    expect(nextTestPollStep({ estado: "Rechazado", attempt: 4, elapsedMs: 20000 })).toEqual({ action: "done" });
    expect(nextTestPollStep({ estado: "Aceptado condicional", attempt: 1, elapsedMs: 2000 })).toEqual({ action: "done" });
  });

  it("backs off 2s, 3s, 5s and then stays at 5s while the estado is not final", () => {
    const delays = [0, 1, 2, 3, 10].map((attempt) => nextTestPollStep({ estado: "En proceso", attempt, elapsedMs: 0 }));
    expect(delays).toEqual([2000, 3000, 5000, 5000, 5000].map((delayMs) => ({ action: "wait", delayMs })));
  });

  it("keeps waiting on 'No encontrado' (not final)", () => {
    expect(nextTestPollStep({ estado: "No encontrado", attempt: 0, elapsedMs: 0 })).toEqual({ action: "wait", delayMs: 2000 });
  });

  it("gives up when the next wait would pass the total cap", () => {
    expect(TEST_POLL_MAX_TOTAL_MS).toBe(180000);
    expect(nextTestPollStep({ estado: "En proceso", attempt: 30, elapsedMs: 175000 })).toEqual({ action: "wait", delayMs: 5000 });
    expect(nextTestPollStep({ estado: "En proceso", attempt: 31, elapsedMs: 175001 })).toEqual({ action: "give-up" });
    expect(TEST_POLL_TIMEOUT_MESSAGE).toMatch(/DGII/);
  });
});
