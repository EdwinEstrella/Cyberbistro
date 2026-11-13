import { describe, expect, it } from "vitest";
import {
  KIND_LABELS,
  RUN_COPY,
  SEND_BATCH_LIMIT,
  buildAuthCheckRequest,
  buildDownloadRequest,
  buildLatestRequest,
  buildSendNextRequest,
  buildStartRequest,
  buildStatusRequest,
  bytesToBase64,
  countByStatus,
  describeProgress,
  describeRunError,
  extractRunInvokeError,
  interpretRunResponse,
  isRunType,
  isTestSetEnvironment,
  nextLoopAction,
  portalDownloads,
  SIMULATION_QUOTAS,
  safeDownloadName,
  shouldAutoPoll,
  shouldOfferConsumoPortalDownloads,
  simulationQuotaSummary,
  statusTone,
  summariesAccepted,
  toRunView,
  validateTestSetFile,
  type RunView,
} from "./ecfCertificationRun";

const TENANT = "11111111-1111-4111-8111-111111111111";
const RUN = "44444444-4444-4444-8444-444444444444";

const item = (encf: string, kind: string, status: string, sequenceOrder: number, messages: unknown = []) => ({
  caseId: `133488485${encf}`,
  encf,
  tipoEcf: encf.slice(1, 3),
  kind,
  sequenceOrder,
  status,
  trackId: status === "sent" ? "t" : null,
  messages,
});

const body = (over: Record<string, unknown> = {}) => ({
  runId: RUN,
  environment: "certification",
  status: "running",
  createdAt: "2026-10-18T10:00:00Z",
  sendComplete: false,
  done: false,
  items: [
    item("E310000000001", "ecf", "sent", 2),
    item("E320000000012", "portal_upload", "ready_for_portal", 0),
    item("E320000000012", "rfce", "accepted", 1, [{ codigo: "1", valor: "ok" }, { foo: 1 }, "x"]),
    item("E340000000001", "ecf", "pending", 3),
  ],
  waitingFor: null,
  stoppedReason: null,
  ...over,
});

const view = (over: Record<string, unknown> = {}) => toRunView(body(over)) as RunView;

describe("test set requests", () => {
  it("validates the selected file", () => {
    expect(validateTestSetFile({ name: "set.xlsx", size: 1000 })).toBeNull();
    expect(validateTestSetFile({ name: "set.xls", size: 1000 })).toMatch(/xlsx/);
    expect(validateTestSetFile({ name: "set.xlsx", size: 0 })).toMatch(/vacío/);
    expect(validateTestSetFile({ name: "set.xlsx", size: 3 * 1024 * 1024 })).toMatch(/2 MB/);
  });

  it("encodes bytes as base64 in chunks", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    expect(bytesToBase64(new Uint8Array())).toBe("");
  });

  it("builds every action body, adding tenantId only when known", () => {
    expect(buildStartRequest({ environment: "certification", xlsxBase64: "AAA=", tenantId: TENANT })).toEqual({
      action: "start",
      environment: "certification",
      xlsxBase64: "AAA=",
      tenantId: TENANT,
    });
    expect(buildStartRequest({ environment: "test", xlsxBase64: "AAA=", tenantId: null })).toEqual({ action: "start", environment: "test", xlsxBase64: "AAA=" });
    expect(buildLatestRequest("certification")).toEqual({ action: "latest", environment: "certification" });
    expect(buildSendNextRequest(RUN, TENANT)).toEqual({ action: "send-next", runId: RUN, limit: SEND_BATCH_LIMIT, tenantId: TENANT });
    expect(buildSendNextRequest(RUN, null, 99).limit).toBe(SEND_BATCH_LIMIT);
    expect(buildSendNextRequest(RUN, null, 0).limit).toBe(1);
    expect(buildStatusRequest(RUN)).toEqual({ action: "status", runId: RUN });
    expect(buildDownloadRequest(RUN, "133488485E320000000012", TENANT)).toEqual({ action: "download", runId: RUN, caseId: "133488485E320000000012", tenantId: TENANT });
    expect(buildAuthCheckRequest("certification", TENANT)).toEqual({ action: "auth-check", environment: "certification", tenantId: TENANT });
    expect(buildAuthCheckRequest("test")).toEqual({ action: "auth-check", environment: "test" });
  });

  it("only runs in the test and certification environments", () => {
    expect(isTestSetEnvironment("test")).toBe(true);
    expect(isTestSetEnvironment("certification")).toBe(true);
    expect(isTestSetEnvironment("production")).toBe(false);
  });
});

describe("run responses", () => {
  it("maps a summary, ordering items and dropping malformed messages", () => {
    const run = view();
    expect(run.items.map((i) => `${i.kind}:${i.status}`)).toEqual(["portal_upload:ready_for_portal", "rfce:accepted", "ecf:sent", "ecf:pending"]);
    expect(run.items[1].messages).toEqual([{ codigo: "1", valor: "ok" }]);
    expect(run.counts).toMatchObject({ ready_for_portal: 1, accepted: 1, sent: 1, pending: 1, rejected: 0 });
  });

  it("drops items with unknown kinds or statuses and rejects malformed bodies", () => {
    const run = toRunView(body({ items: [item("E310000000001", "weird", "sent", 0), item("E310000000002", "ecf", "nope", 1), item("E310000000003", "ecf", "error", 2)] }));
    expect(run!.items.map((i) => i.encf)).toEqual(["E310000000003"]);
    expect(toRunView(null)).toBeNull();
    expect(toRunView({ runId: RUN })).toBeNull();
  });

  it("maps error bodies to Spanish messages", () => {
    expect(interpretRunResponse({ code: "RNC_MISMATCH", error: "x" })).toEqual({ ok: false, code: "RNC_MISMATCH", message: expect.stringMatching(/RNC/) });
    expect(interpretRunResponse({ code: "INVALID_TEST_SET", error: "Sheet ECF: ENCF is missing." })).toMatchObject({
      ok: false,
      message: expect.stringContaining("Detalle: Sheet ECF: ENCF is missing."),
    });
    expect(interpretRunResponse({})).toMatchObject({ ok: false, message: "No se pudo procesar el Set de Pruebas." });
    expect(interpretRunResponse(body()).ok).toBe(true);
    expect(describeRunError("DGII_AUTH_REJECTED")).toMatch(/certificado/);
    expect(describeRunError("UNKNOWN")).toBe("No se pudo procesar el Set de Pruebas.");
  });

  it("reads FunctionsHttpError bodies", async () => {
    const error = { context: new Response(JSON.stringify({ code: "CERTIFICATE_NOT_READY", error: "x" }), { status: 409 }) };
    expect(await extractRunInvokeError(error)).toMatchObject({ code: "CERTIFICATE_NOT_READY", message: expect.stringMatching(/certificado/) });
    expect(await extractRunInvokeError(new Error("network"))).toEqual({ ok: false, message: "No se pudo procesar el Set de Pruebas." });
    expect(await extractRunInvokeError({ context: new Response("not json") })).toEqual({ ok: false, message: "No se pudo procesar el Set de Pruebas." });
  });
});

describe("progress and loop", () => {
  it("summarizes progress counts", () => {
    const progress = describeProgress(view());
    expect(progress).toMatchObject({ total: 4, finished: 2, accepted: 2, failed: 0, inProcess: 1, pending: 1 });
    expect(progress.label).toBe("2 de 4 terminados · 2 aceptados o firmados · 0 con error · 1 en proceso · 1 pendientes");
    expect(countByStatus([])).toMatchObject({ pending: 0, error: 0 });
  });

  it("lists the signed consumo invoices for the portal and checks their summaries", () => {
    const run = view();
    expect(portalDownloads(run).map((i) => i.encf)).toEqual(["E320000000012"]);
    expect(summariesAccepted(run)).toBe(true);
    expect(summariesAccepted(view({ items: [item("E320000000012", "rfce", "rejected", 0)] }))).toBe(false);
    expect(summariesAccepted(view({ items: [] }))).toBe(false);
  });

  it("decides the next step of the send loop", () => {
    expect(nextLoopAction(view())).toBe("continue");
    expect(nextLoopAction(view({ waitingFor: "133488485E310000000001" }))).toBe("poll");
    expect(nextLoopAction(view({ sendComplete: true }))).toBe("done");
    expect(nextLoopAction(view({ stoppedReason: "DGII_UNAVAILABLE", waitingFor: "x" }))).toBe("stop");
  });

  it("decides whether to auto-poll sent items", () => {
    expect(shouldAutoPoll(view(), 0, 10)).toBe(true);
    expect(shouldAutoPoll(view(), 9, 10)).toBe(true);
    const noSent = view({ items: [item("E310000000001", "ecf", "accepted", 0)] });
    expect(noSent.counts.sent).toBe(0);
    expect(shouldAutoPoll(noSent, 0, 10)).toBe(false);
    expect(shouldAutoPoll(view({ stoppedReason: "DGII_UNAVAILABLE" }), 0, 10)).toBe(false);
    expect(shouldAutoPoll(view(), 10, 10)).toBe(false);
    expect(shouldAutoPoll(view(), 15, 10)).toBe(false);
  });

  it("assigns a tone per status and sanitizes download names", () => {
    expect(statusTone("accepted")).toBe("success");
    expect(statusTone("ready_for_portal")).toBe("success");
    expect(statusTone("accepted_conditional")).toBe("warning");
    expect(statusTone("rejected")).toBe("danger");
    expect(statusTone("sent")).toBe("progress");
    expect(statusTone("pending")).toBe("neutral");
    expect(safeDownloadName("133488485E320000000012.xml", "c")).toBe("133488485E320000000012.xml");
    expect(safeDownloadName("../evil.sh", "133488485E320000000012")).toBe("133488485E320000000012.xml");
  });
});

describe("commercial approval runs", () => {
  const approvalBody = (over: Record<string, unknown> = {}) =>
    body({
      runType: "commercial_approval",
      items: [item("E310000000001", "acecf", "accepted", 0), item("E310000000004", "acecf", "rejected", 1), item("E330000000001", "acecf", "pending", 2)],
      ...over,
    });

  it("adds runType to start and latest only when given, so step 2 requests are unchanged", () => {
    expect(buildStartRequest({ environment: "certification", xlsxBase64: "AAA=", tenantId: TENANT, runType: "commercial_approval" })).toEqual({
      action: "start",
      environment: "certification",
      xlsxBase64: "AAA=",
      runType: "commercial_approval",
      tenantId: TENANT,
    });
    expect(buildLatestRequest("certification", TENANT, "commercial_approval")).toEqual({
      action: "latest",
      environment: "certification",
      runType: "commercial_approval",
      tenantId: TENANT,
    });
    expect(buildLatestRequest("certification", TENANT, "test_set")).toEqual({ action: "latest", environment: "certification", runType: "test_set", tenantId: TENANT });
    expect(buildLatestRequest("certification", TENANT)).not.toHaveProperty("runType");
  });

  it("reads the run type (defaulting to test_set) and the acecf kind", () => {
    expect(view().runType).toBe("test_set");
    expect(toRunView(approvalBody())?.runType).toBe("commercial_approval");
    expect(toRunView(body({ runType: "other" }))?.runType).toBe("test_set");
    const run = toRunView(approvalBody())!;
    expect(run.items.map((entry) => entry.kind)).toEqual(["acecf", "acecf", "acecf"]);
    expect(KIND_LABELS.acecf).toBe("Aprobación comercial");
  });

  it("describes progress without test-set wording and never offers portal downloads", () => {
    const run = toRunView(approvalBody())!;
    expect(describeProgress(run).label).toBe("2 de 3 terminadas · 1 aceptadas · 1 con error · 1 pendientes");
    expect(portalDownloads(run)).toEqual([]);
  });

  it("uses commercial approval wording for errors and file validation", () => {
    expect(describeRunError("RNC_MISMATCH", undefined, "commercial_approval")).toMatch(/RNC comprador/);
    expect(describeRunError("RNC_MISMATCH")).toMatch(/Set de Pruebas/);
    expect(describeRunError("INVALID_TEST_SET", "x", "commercial_approval")).toBe("El archivo no es un Set de Aprobaciones Comerciales válido de la DGII. Detalle: x");
    expect(describeRunError("UNKNOWN", undefined, "commercial_approval")).toBe("No se pudo procesar el Set de Aprobaciones Comerciales.");
    expect(describeRunError("DGII_TIMEOUT", undefined, "commercial_approval")).toBe(describeRunError("DGII_TIMEOUT"));
    expect(validateTestSetFile({ name: "set.xls", size: 10 }, "commercial_approval")).toBe("Seleccioná el archivo .xlsx del Set de Aprobaciones Comerciales.");
    expect(validateTestSetFile({ name: "set.xls", size: 10 })).toBe("Seleccioná el archivo .xlsx del Set de Pruebas.");
    expect(interpretRunResponse({ code: "UNKNOWN" }, "commercial_approval")).toMatchObject({ ok: false, message: "No se pudo procesar el Set de Aprobaciones Comerciales." });
  });

  it("maps invoke errors with the run type wording", async () => {
    const error = { context: new Response(JSON.stringify({ code: "RUN_NOT_FOUND" }), { status: 404 }) };
    expect(await extractRunInvokeError(error, "commercial_approval")).toMatchObject({ code: "RUN_NOT_FOUND", message: expect.stringContaining("Aprobaciones Comerciales") });
    expect(await extractRunInvokeError({}, "commercial_approval")).toMatchObject({ message: "No se pudo procesar el Set de Aprobaciones Comerciales." });
  });

  it("keeps per-type copy for the runner", () => {
    expect(RUN_COPY.commercial_approval.title).toBe("Set de Aprobaciones Comerciales de la DGII (.xlsx)");
    expect(RUN_COPY.commercial_approval.description).toContain("ACECF");
    expect(RUN_COPY.commercial_approval.loaded(11)).toContain("11 aprobaciones");
    expect(RUN_COPY.test_set.loaded(4)).toBe("Set de Pruebas cargado: 4 documentos listos para enviar.");
    expect(isRunType("commercial_approval")).toBe(true);
    expect(isRunType("x")).toBe(false);
  });
});

describe("simulation runs", () => {
  const sim = (items: ReturnType<typeof item>[]) => toRunView({ ...body(), runType: "simulation", items }) as RunView;
  const signedItem = (encf: string, kind: string, status: string, order: number, signed = true) => ({ ...item(encf, kind, status, order), signed, sourceCaseId: `133488485${encf.slice(0, 3)}0000000001` });

  it("has its own copy, run type and messages", () => {
    expect(isRunType("simulation")).toBe(true);
    expect(RUN_COPY.simulation.title).toBe("Simulación e-CF (Paso 4 de la DGII)");
    expect(RUN_COPY.simulation.description).toContain("Cargá el mismo Excel del Set de Pruebas (Paso 2)");
    expect(RUN_COPY.simulation.description).toContain("impuestos adicionales");
    expect(RUN_COPY.simulation.description).toContain("fecha del Excel");
    expect(RUN_COPY.simulation.description).toContain("menores a 250 mil se descargan");
    expect(describeRunError("SEQUENCE_CONFLICT", undefined, "simulation")).toContain("secuencias");
    expect(describeRunError("INVALID_TEST_SET", "bad", "simulation")).toBe("El archivo no es el Set de Pruebas (Paso 2) de la DGII. Detalle: bad");
    expect(describeRunError(undefined, undefined, "simulation")).toBe("No se pudo procesar la Simulación e-CF.");
    expect(buildStartRequest({ environment: "certification", xlsxBase64: "QQ==", runType: "simulation" })).toMatchObject({ runType: "simulation" });
    expect(buildLatestRequest("certification", null, "simulation")).toEqual({ action: "latest", environment: "certification", runType: "simulation" });
    expect(buildDownloadRequest(RUN, "c", TENANT, "rfce")).toEqual({ action: "download", runId: RUN, caseId: "c", kind: "rfce", tenantId: TENANT });
  });

  it("maps the source case and signed flags", () => {
    const run = sim([signedItem("E310000000011", "ecf", "accepted", 0)]);
    expect(run.runType).toBe("simulation");
    expect(run.items[0]).toMatchObject({ sourceCaseId: "133488485E310000000001", signed: true });
    expect(view().items[0]).toMatchObject({ sourceCaseId: null, signed: false });
  });

  it("matches the DGII portal quotas", () => {
    expect(SIMULATION_QUOTAS.map((quota) => `${quota.label}:${quota.expected}`)).toEqual([
      "E31:4", "E32 ≥ 250 mil:2", "E33:1", "E34:2", "E41:2", "E43:2", "E44:2", "E45:2", "E46:2", "E47:2", "RFCE (E32 < 250 mil):4",
    ]);
    expect(SIMULATION_QUOTAS.reduce((total, quota) => total + quota.expected, 0)).toBe(25);
  });

  it("counts accepted documents per quota line, consumo E32 through their RFCE", () => {
    const run = sim([
      signedItem("E320000000017", "portal_upload", "ready_for_portal", 0),
      signedItem("E320000000017", "rfce", "accepted", 1),
      signedItem("E320000000016", "ecf", "accepted_conditional", 2),
      signedItem("E310000000011", "ecf", "accepted", 3),
      signedItem("E310000000012", "ecf", "rejected", 4),
      signedItem("E340000000017", "ecf", "pending", 5, false),
    ]);
    const byLabel = Object.fromEntries(simulationQuotaSummary(run).map((quota) => [quota.label, quota]));
    expect(byLabel.E31).toEqual({ label: "E31", expected: 4, accepted: 1, inRun: 2 });
    expect(byLabel["E32 ≥ 250 mil"]).toMatchObject({ accepted: 1, inRun: 1 });
    expect(byLabel["RFCE (E32 < 250 mil)"]).toMatchObject({ accepted: 1, inRun: 1 });
    expect(byLabel.E34).toMatchObject({ accepted: 0, inRun: 1 });
    expect(byLabel.E47).toMatchObject({ accepted: 0, inRun: 0 });
  });
});

describe("shouldOfferConsumoPortalDownloads", () => {
  it("returns true for test_set and simulation runs with at least one download", () => {
    expect(shouldOfferConsumoPortalDownloads("test_set", 1)).toBe(true);
    expect(shouldOfferConsumoPortalDownloads("test_set", 4)).toBe(true);
    expect(shouldOfferConsumoPortalDownloads("simulation", 1)).toBe(true);
    expect(shouldOfferConsumoPortalDownloads("simulation", 4)).toBe(true);
  });

  it("returns false when downloads count is zero", () => {
    expect(shouldOfferConsumoPortalDownloads("test_set", 0)).toBe(false);
    expect(shouldOfferConsumoPortalDownloads("commercial_approval", 0)).toBe(false);
    expect(shouldOfferConsumoPortalDownloads("simulation", 0)).toBe(false);
  });

  it("returns false for commercial_approval even with downloads", () => {
    expect(shouldOfferConsumoPortalDownloads("commercial_approval", 1)).toBe(false);
    expect(shouldOfferConsumoPortalDownloads("commercial_approval", 3)).toBe(false);
  });
});
