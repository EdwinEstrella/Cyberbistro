import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SENDER_EMAIL,
  buildEmail,
  formatDominicanDate,
} from "../supabase/functions/menu-suggestion-email/buildEmail";
import { escapeHtml } from "../supabase/functions/menu-suggestion-email/escapeHtml";
import {
  handleRequest,
  type ResendResult,
  type SendResendEmailParams,
  type SuggestionEmailStore,
  type SuggestionRow,
  type TenantInfo,
} from "../supabase/functions/menu-suggestion-email/handler";
import { isValidEmail } from "../supabase/functions/menu-suggestion-email/isValidEmail";
import { parseBody, ValidationError } from "../supabase/functions/menu-suggestion-email/parseBody";
import { resolveRecipient } from "../supabase/functions/menu-suggestion-email/resolveRecipient";
import { createSupabaseStore } from "../supabase/functions/menu-suggestion-email/store";

describe("menu-suggestion-email: escapeHtml", () => {
  it("escapes all 5 HTML special characters", () => {
    expect(escapeHtml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });

  it("escapes hostile XSS script payloads", () => {
    const hostile = `<script>alert('xss')</script>`;
    expect(escapeHtml(hostile)).toBe("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  it("escapes hostile HTML attribute injection payloads", () => {
    const hostile = `" onfocus="alert('pwned')`;
    expect(escapeHtml(hostile)).toBe("&quot; onfocus=&quot;alert(&#39;pwned&#39;)");
  });

  it("returns empty string for non-string values", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(123)).toBe("");
  });

  it("leaves clean strings untouched", () => {
    expect(escapeHtml("Excelente servicio y muy rica la comida.")).toBe(
      "Excelente servicio y muy rica la comida.",
    );
  });
});

describe("menu-suggestion-email: isValidEmail", () => {
  it("accepts valid standard email addresses", () => {
    expect(isValidEmail("owner@azokia.com")).toBe(true);
    expect(isValidEmail("user.name+tag@sub.domain.do")).toBe(true);
    expect(isValidEmail("admin123@bistro.caribe.com")).toBe(true);
  });

  it("rejects invalid formats, missing domain, or missing @", () => {
    expect(isValidEmail("plainaddress")).toBe(false);
    expect(isValidEmail("@missingusername.com")).toBe(false);
    expect(isValidEmail("username@.com")).toBe(false);
    expect(isValidEmail("username@domain")).toBe(false);
  });

  it("rejects emails with spaces or CRLF injection characters", () => {
    expect(isValidEmail("user name@domain.com")).toBe(false);
    expect(isValidEmail("user@domain.com\r\nBcc: evil@attacker.com")).toBe(false);
    expect(isValidEmail("user\t@domain.com")).toBe(false);
  });

  it("rejects non-strings, empty strings, and overly long addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(12345)).toBe(false);

    const longLocal = "a".repeat(250);
    expect(isValidEmail(`${longLocal}@example.com`)).toBe(false);
  });
});

describe("menu-suggestion-email: resolveRecipient", () => {
  it("resolves settings email when both settings email and owner email are valid", () => {
    const result = resolveRecipient({
      settingsEmail: "sugerencias@mibistro.com",
      ownerEmail: "owner@salpimentao.com",
    });
    expect(result).toBe("sugerencias@mibistro.com");
  });

  it("falls back to owner email when settings email is null or empty", () => {
    expect(
      resolveRecipient({
        settingsEmail: null,
        ownerEmail: "owner@salpimentao.com",
      }),
    ).toBe("owner@salpimentao.com");

    expect(
      resolveRecipient({
        settingsEmail: "   ",
        ownerEmail: "owner@salpimentao.com",
      }),
    ).toBe("owner@salpimentao.com");
  });

  it("falls back to owner email when settings email is invalid format", () => {
    const result = resolveRecipient({
      settingsEmail: "not-an-email",
      ownerEmail: "owner@salpimentao.com",
    });
    expect(result).toBe("owner@salpimentao.com");
  });

  it("returns null when neither settings email nor owner email can be resolved", () => {
    expect(resolveRecipient({ settingsEmail: null, ownerEmail: null })).toBeNull();
    expect(resolveRecipient({ settingsEmail: "", ownerEmail: "" })).toBeNull();
    expect(
      resolveRecipient({
        settingsEmail: "invalid-settings",
        ownerEmail: "invalid-owner",
      }),
    ).toBeNull();
  });
});

describe("menu-suggestion-email: parseBody", () => {
  it("parses valid body with UUID suggestion_id", () => {
    const body = { suggestion_id: "c4b3f81e-1234-4567-89ab-cdef01234567" };
    const parsed = parseBody(body);
    expect(parsed.suggestion_id).toBe("c4b3f81e-1234-4567-89ab-cdef01234567");
  });

  it("normalizes uppercase UUIDs to lowercase", () => {
    const body = { suggestion_id: "C4B3F81E-1234-4567-89AB-CDEF01234567" };
    const parsed = parseBody(body);
    expect(parsed.suggestion_id).toBe("c4b3f81e-1234-4567-89ab-cdef01234567");
  });

  it("throws ValidationError for non-object payloads", () => {
    expect(() => parseBody(null)).toThrow(ValidationError);
    expect(() => parseBody(undefined)).toThrow(ValidationError);
    expect(() => parseBody("string")).toThrow(ValidationError);
    expect(() => parseBody([1, 2, 3])).toThrow(ValidationError);
  });

  it("throws ValidationError when suggestion_id is missing or empty", () => {
    expect(() => parseBody({})).toThrow(ValidationError);
    expect(() => parseBody({ suggestion_id: "" })).toThrow(ValidationError);
    expect(() => parseBody({ suggestion_id: "   " })).toThrow(ValidationError);
  });

  it("throws ValidationError when suggestion_id is not a valid UUID", () => {
    expect(() => parseBody({ suggestion_id: "12345" })).toThrow(ValidationError);
    expect(() => parseBody({ suggestion_id: "not-a-uuid" })).toThrow(ValidationError);
    expect(() =>
      parseBody({ suggestion_id: "c4b3f81e-1234-4567-89ab-cdef0123456g" }),
    ).toThrow(ValidationError);
  });
});

describe("menu-suggestion-email: buildEmail & Dominican date", () => {
  it("formats date in Dominican Republic time (America/Santo_Domingo UTC-4)", () => {
    // 2026-11-13T19:00:00Z corresponds to 3:00 p.m. Santo Domingo time
    const formatted = formatDominicanDate("2026-11-13T19:00:00Z");
    expect(formatted).toContain("13 de noviembre de 2026");
    expect(formatted).toMatch(/3:00/);
    expect(formatted).toMatch(/p\.\s*m\./i);
  });

  it("builds email payload with business name in subject", () => {
    const email = buildEmail({
      businessName: "Bistro Caribe",
      recipient: "gerencia@bistrocaribe.com",
      message: "Por favor agreguen más opciones vegetarianas.",
      contact: "cliente@gmail.com",
      mesaNumero: 4,
      createdAt: "2026-11-13T19:00:00Z",
    });

    expect(email.from).toBe(DEFAULT_SENDER_EMAIL);
    expect(email.to).toEqual(["gerencia@bistrocaribe.com"]);
    expect(email.subject).toBe("Nueva sugerencia - Bistro Caribe");
    expect(email.reply_to).toBe("cliente@gmail.com");
    expect(email.text).toContain("Mesa: Mesa 4");
    expect(email.text).toContain("Contacto: cliente@gmail.com");
    expect(email.text).toContain("Por favor agreguen más opciones vegetarianas.");
    expect(email.html).toContain("Mesa 4");
    expect(email.html).toContain("cliente@gmail.com");
    expect(email.html).toContain("Por favor agreguen más opciones vegetarianas.");
  });

  it("falls back gracefully when business name is omitted", () => {
    const email = buildEmail({
      recipient: "owner@bistro.com",
      message: "Buen servicio",
      createdAt: "2026-11-13T19:00:00Z",
    });

    expect(email.subject).toBe("Nueva sugerencia");
  });

  it("omits reply_to when contact is not a valid email (e.g. phone number)", () => {
    const emailWithPhone = buildEmail({
      businessName: "Bistro Caribe",
      recipient: "owner@bistro.com",
      message: "Excelente comida",
      contact: "809-555-1234",
      mesaNumero: null,
      createdAt: "2026-11-13T19:00:00Z",
    });

    expect(emailWithPhone.reply_to).toBeUndefined();
    expect(emailWithPhone.text).toContain("Contacto: 809-555-1234");
    expect(emailWithPhone.text).toContain("Sin mesa");
    expect(emailWithPhone.html).toContain("809-555-1234");
  });

  it("omits reply_to and displays 'No proporcionado' when contact is omitted", () => {
    const emailNoContact = buildEmail({
      recipient: "owner@bistro.com",
      message: "Buen ambiente",
      createdAt: "2026-11-13T19:00:00Z",
    });

    expect(emailNoContact.reply_to).toBeUndefined();
    expect(emailNoContact.text).toContain("Contacto: No proporcionado");
    expect(emailNoContact.html).toContain("No proporcionado");
  });

  it("strictly escapes hostile user input inside the HTML body", () => {
    const email = buildEmail({
      businessName: "El <Rincón> & Bar",
      recipient: "owner@bistro.com",
      message: "<script>alert('xss')</script> & 'quotes'",
      contact: "<b>evil</b>@attacker.com",
      mesaNumero: 2,
      createdAt: "2026-11-13T19:00:00Z",
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    expect(email.html).toContain("El &lt;Rincón&gt; &amp; Bar");
  });
});

describe("menu-suggestion-email: handleRequest & atomic claim logic", () => {
  const SUGGESTION_ID = "c4b3f81e-1234-4567-89ab-cdef01234567";
  const TENANT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  function createMockStore(initialRow?: SuggestionRow | null): {
    store: SuggestionEmailStore;
    state: {
      row: SuggestionRow | null;
      claimedIds: string[];
      sentIds: string[];
      failedRecords: { id: string; error: string }[];
      skippedRecords: { id: string; reason: string }[];
    };
  } {
    const state = {
      row: initialRow ?? null,
      claimedIds: [] as string[],
      sentIds: [] as string[],
      failedRecords: [] as { id: string; error: string }[],
      skippedRecords: [] as { id: string; reason: string }[],
    };

    const store: SuggestionEmailStore = {
      async claimSuggestion(id: string) {
        if (!state.row || state.row.id !== id || state.row.email_status !== "pending") {
          return null;
        }
        state.claimedIds.push(id);
        // Atomically transition from pending to sent
        state.row.email_status = "sent";
        return { ...state.row };
      },

      async resolveTenantInfo(_tenantId: string): Promise<TenantInfo> {
        return {
          businessName: "Restaurante Central",
          ownerEmail: "owner@central.com",
        };
      },

      async getPublicContactEmail(_tenantId: string, _sucursalId: string | null) {
        return "sugerencias@central.com";
      },

      async markSent(id: string) {
        state.sentIds.push(id);
        if (state.row && state.row.id === id) {
          state.row.email_status = "sent";
          state.row.email_error = null;
        }
      },

      async markFailed(id: string, error: string) {
        state.failedRecords.push({ id, error });
        if (state.row && state.row.id === id) {
          state.row.email_status = "failed";
          state.row.email_error = error;
        }
      },

      async markSkipped(id: string, reason: string) {
        state.skippedRecords.push({ id, reason });
        if (state.row && state.row.id === id) {
          state.row.email_status = "skipped";
          state.row.email_error = reason;
        }
      },
    };

    return { store, state };
  }

  function makePostRequest(body: unknown): Request {
    return new Request("https://example.com/menu-suggestion-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  it("responds 200 'ok' to OPTIONS preflight with CORS headers", async () => {
    const { store } = createMockStore();
    const req = new Request("https://example.com/menu-suggestion-email", { method: "OPTIONS" });

    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => "re_123456",
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.text()).toBe("ok");
  });

  it("responds 405 Method Not Allowed for GET or non-POST requests", async () => {
    const { store } = createMockStore();
    const req = new Request("https://example.com/menu-suggestion-email", { method: "GET" });

    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => "re_123456",
    });

    expect(res.status).toBe(405);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("returns 400 for malformed or non-UUID bodies", async () => {
    const { store } = createMockStore();
    const req = makePostRequest({ suggestion_id: "not-a-uuid" });

    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => "re_123456",
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("returns neutral 200 { ok: true } when suggestion does not exist", async () => {
    const { store } = createMockStore(null);
    const sendResendEmail = vi.fn();

    const req = makePostRequest({ suggestion_id: SUGGESTION_ID });
    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => "re_123456",
      sendResendEmail,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("returns neutral 200 { ok: true } when suggestion is already sent or non-pending", async () => {
    const { store } = createMockStore({
      id: SUGGESTION_ID,
      tenant_id: TENANT_ID,
      sucursal_id: null,
      mesa_numero: 1,
      message: "Muy rico todo",
      contact: null,
      created_at: "2026-11-13T19:00:00Z",
      email_status: "sent", // Already processed
      email_error: null,
    });
    const sendResendEmail = vi.fn();

    const req = makePostRequest({ suggestion_id: SUGGESTION_ID });
    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => "re_123456",
      sendResendEmail,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("guarantees idempotent claims: duplicate concurrent calls send at most once", async () => {
    const { store, state } = createMockStore({
      id: SUGGESTION_ID,
      tenant_id: TENANT_ID,
      sucursal_id: null,
      mesa_numero: 2,
      message: "Excelente ambiente",
      contact: null,
      created_at: "2026-11-13T19:00:00Z",
      email_status: "pending",
      email_error: null,
    });

    const sendResendEmail = vi.fn(async (): Promise<ResendResult> => ({ ok: true, id: "msg_123" }));

    const req1 = makePostRequest({ suggestion_id: SUGGESTION_ID });
    const req2 = makePostRequest({ suggestion_id: SUGGESTION_ID });

    // First call succeeds and claims the row
    const res1 = await handleRequest(req1, {
      store,
      getResendApiKey: () => "re_123456",
      sendResendEmail,
    });

    // Second call arrives for the same suggestion
    const res2 = await handleRequest(req2, {
      store,
      getResendApiKey: () => "re_123456",
      sendResendEmail,
    });

    expect(res1.status).toBe(200);
    expect(await res1.json()).toEqual({ ok: true });

    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ ok: true });

    // Only one email sent via Resend
    expect(sendResendEmail).toHaveBeenCalledTimes(1);
    expect(state.claimedIds).toEqual([SUGGESTION_ID]);
    expect(state.sentIds).toEqual([SUGGESTION_ID]);
  });

  it("handles missing RESEND_API_KEY by marking failed and returning generic 500 error", async () => {
    const { store, state } = createMockStore({
      id: SUGGESTION_ID,
      tenant_id: TENANT_ID,
      sucursal_id: null,
      mesa_numero: null,
      message: "Probar sin api key",
      contact: null,
      created_at: "2026-11-13T19:00:00Z",
      email_status: "pending",
      email_error: null,
    });

    const sendResendEmail = vi.fn();
    const req = makePostRequest({ suggestion_id: SUGGESTION_ID });

    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => undefined, // Missing key
      sendResendEmail,
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Email delivery service unavailable");

    expect(sendResendEmail).not.toHaveBeenCalled();
    expect(state.failedRecords).toHaveLength(1);
    expect(state.failedRecords[0].error).toContain("RESEND_API_KEY is not configured");
  });

  it("marks row as skipped when no recipient email can be resolved", async () => {
    const { store, state } = createMockStore({
      id: SUGGESTION_ID,
      tenant_id: TENANT_ID,
      sucursal_id: null,
      mesa_numero: null,
      message: "Sin destinatario",
      contact: null,
      created_at: "2026-11-13T19:00:00Z",
      email_status: "pending",
      email_error: null,
    });

    // Mock store with no resolvable recipient
    store.getPublicContactEmail = async () => null;
    store.resolveTenantInfo = async () => ({ businessName: "Demo", ownerEmail: null });

    const sendResendEmail = vi.fn();
    const req = makePostRequest({ suggestion_id: SUGGESTION_ID });

    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => "re_123456",
      sendResendEmail,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendResendEmail).not.toHaveBeenCalled();
    expect(state.skippedRecords).toHaveLength(1);
    expect(state.skippedRecords[0].reason).toBe("No recipient email configured");
  });

  it("handles Resend network or API failure by marking row failed and returning 500", async () => {
    const { store, state } = createMockStore({
      id: SUGGESTION_ID,
      tenant_id: TENANT_ID,
      sucursal_id: null,
      mesa_numero: 5,
      message: "Fallo en Resend",
      contact: null,
      created_at: "2026-11-13T19:00:00Z",
      email_status: "pending",
      email_error: null,
    });

    const sendResendEmail = vi.fn(
      async (_params: SendResendEmailParams): Promise<ResendResult> => ({
        ok: false,
        error: "Rate limit exceeded on Resend",
      }),
    );

    const req = makePostRequest({ suggestion_id: SUGGESTION_ID });
    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => "re_123456",
      sendResendEmail,
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Failed to send email");

    expect(state.failedRecords).toHaveLength(1);
    expect(state.failedRecords[0].error).toBe("Rate limit exceeded on Resend");
  });

  it("passes the suggestion-derived idempotency key to Resend", async () => {
    const { store } = createMockStore({
      id: SUGGESTION_ID,
      tenant_id: TENANT_ID,
      sucursal_id: null,
      mesa_numero: 1,
      message: "Verificar llave de idempotencia",
      contact: null,
      created_at: "2026-11-13T19:00:00Z",
      email_status: "pending",
      email_error: null,
    });

    let capturedParams: SendResendEmailParams | null = null;
    const sendResendEmail = vi.fn(async (params: SendResendEmailParams): Promise<ResendResult> => {
      capturedParams = params;
      return { ok: true, id: "msg_999" };
    });

    const req = makePostRequest({ suggestion_id: SUGGESTION_ID });
    await handleRequest(req, {
      store,
      getResendApiKey: () => "re_test_key",
      sendResendEmail,
    });

    expect(capturedParams).not.toBeNull();
    expect(capturedParams!.apiKey).toBe("re_test_key");
    expect(capturedParams!.idempotencyKey).toBe(`suggestion-${SUGGESTION_ID}`);
    expect(capturedParams!.email.subject).toContain("Restaurante Central");
  });

  it("marks row failed with generic message and returns 500 when resolveTenantInfo rejects after claim", async () => {
    const { store, state } = createMockStore({
      id: SUGGESTION_ID,
      tenant_id: TENANT_ID,
      sucursal_id: null,
      mesa_numero: 1,
      message: "Test tenant info rejection",
      contact: null,
      created_at: "2026-11-13T19:00:00Z",
      email_status: "pending",
      email_error: null,
    });

    const markFailedSpy = vi.spyOn(store, "markFailed");
    store.resolveTenantInfo = vi.fn().mockRejectedValue(new Error("Database connection dropped"));

    const sendResendEmail = vi.fn();
    const req = makePostRequest({ suggestion_id: SUGGESTION_ID });

    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => "re_123456",
      sendResendEmail,
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: "An unexpected error occurred" });

    expect(sendResendEmail).not.toHaveBeenCalled();
    expect(markFailedSpy).toHaveBeenCalledTimes(1);
    expect(markFailedSpy).toHaveBeenCalledWith(SUGGESTION_ID, "Unexpected error while sending the suggestion email");
    expect(state.row?.email_status).toBe("failed");
    expect(state.row?.email_error).toBe("Unexpected error while sending the suggestion email");
  });

  it("marks row failed with generic message and returns 500 when sendResendEmail throws", async () => {
    const { store, state } = createMockStore({
      id: SUGGESTION_ID,
      tenant_id: TENANT_ID,
      sucursal_id: null,
      mesa_numero: 1,
      message: "Test sendResendEmail rejection",
      contact: null,
      created_at: "2026-11-13T19:00:00Z",
      email_status: "pending",
      email_error: null,
    });

    const markFailedSpy = vi.spyOn(store, "markFailed");
    const sendResendEmail = vi.fn().mockRejectedValue(new Error("Network TLS handshake timeout"));
    const req = makePostRequest({ suggestion_id: SUGGESTION_ID });

    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => "re_123456",
      sendResendEmail,
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: "An unexpected error occurred" });

    expect(markFailedSpy).toHaveBeenCalledTimes(1);
    expect(markFailedSpy).toHaveBeenCalledWith(SUGGESTION_ID, "Unexpected error while sending the suggestion email");
    expect(state.row?.email_status).toBe("failed");
    expect(state.row?.email_error).toBe("Unexpected error while sending the suggestion email");
  });

  it("does not overwrite row with failure marking and returns 200 when markSent rejects after successful Resend send", async () => {
    const { store, state } = createMockStore({
      id: SUGGESTION_ID,
      tenant_id: TENANT_ID,
      sucursal_id: null,
      mesa_numero: 1,
      message: "Test markSent rejection",
      contact: null,
      created_at: "2026-11-13T19:00:00Z",
      email_status: "pending",
      email_error: null,
    });

    const markFailedSpy = vi.spyOn(store, "markFailed");
    store.markSent = vi.fn().mockRejectedValue(new Error("Supabase write conflict"));

    const sendResendEmail = vi.fn(async (): Promise<ResendResult> => ({ ok: true, id: "msg_success_123" }));
    const logSpy = vi.fn();
    const req = makePostRequest({ suggestion_id: SUGGESTION_ID });

    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => "re_123456",
      sendResendEmail,
      log: logSpy,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });

    expect(sendResendEmail).toHaveBeenCalledTimes(1);
    expect(markFailedSpy).not.toHaveBeenCalled();
    // Row remains 'sent' because claimSuggestion transitioned it to 'sent'
    expect(state.row?.email_status).toBe("sent");
    expect(state.failedRecords).toHaveLength(0);
    expect(logSpy).toHaveBeenCalledWith("warn", expect.stringContaining("Failed to mark suggestion as sent"), expect.any(Object));
  });

  it("returns generic 500 without throwing when markFailed itself rejects inside outer catch", async () => {
    const { store } = createMockStore({
      id: SUGGESTION_ID,
      tenant_id: TENANT_ID,
      sucursal_id: null,
      mesa_numero: 1,
      message: "Test markFailed failure in catch",
      contact: null,
      created_at: "2026-11-13T19:00:00Z",
      email_status: "pending",
      email_error: null,
    });

    // Cause flow to throw after claim
    store.resolveTenantInfo = vi.fn().mockRejectedValue(new Error("Fatal read error"));
    // Cause recovery markFailed to also reject
    store.markFailed = vi.fn().mockRejectedValue(new Error("Fatal write error on failed status"));

    const sendResendEmail = vi.fn();
    const logSpy = vi.fn();
    const req = makePostRequest({ suggestion_id: SUGGESTION_ID });

    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => "re_123456",
      sendResendEmail,
      log: logSpy,
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: "An unexpected error occurred" });
    expect(logSpy).toHaveBeenCalledWith("warn", expect.stringContaining("Failed to mark suggestion as failed during unhandled error recovery"), expect.any(Object));
  });

  it("returns generic 500 without calling markFailed when claimSuggestion rejects with DB error", async () => {
    const { store } = createMockStore();
    const markFailedSpy = vi.spyOn(store, "markFailed");
    store.claimSuggestion = vi.fn().mockRejectedValue(new Error("Transient connection error during claim"));

    const sendResendEmail = vi.fn();
    const logSpy = vi.fn();
    const req = makePostRequest({ suggestion_id: SUGGESTION_ID });

    const res = await handleRequest(req, {
      store,
      getResendApiKey: () => "re_123456",
      sendResendEmail,
      log: logSpy,
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: "An unexpected error occurred" });
    expect(sendResendEmail).not.toHaveBeenCalled();
    expect(markFailedSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("error", "Unhandled error processing suggestion email");
  });
});

describe("menu-suggestion-email: createSupabaseStore", () => {
  it("claims suggestion atomically via update eq('email_status', 'pending')", async () => {
    let capturedTable = "";
    let capturedUpdate = null as any;
    const queryBuilder = {
      update(values: any) {
        capturedUpdate = values;
        return this;
      },
      eq(_col: string, _val: any) {
        return this;
      },
      select(_fields: string) {
        return this;
      },
      async maybeSingle() {
        return {
          data: {
            id: "s1",
            tenant_id: "t1",
            sucursal_id: null,
            mesa_numero: 2,
            message: "Hola",
            contact: null,
            created_at: "2026-11-13T19:00:00Z",
            email_status: "sent",
            email_error: null,
          },
          error: null,
        };
      },
    };

    const mockClient = {
      from(table: string) {
        capturedTable = table;
        return queryBuilder;
      },
    };

    const store = createSupabaseStore(mockClient);
    const row = await store.claimSuggestion("s1");

    expect(capturedTable).toBe("menu_suggestions");
    expect(capturedUpdate).toEqual({ email_status: "sent" });
    expect(row?.id).toBe("s1");
  });

  it("resolves tenant info from tenants and tenant_users admin role", async () => {
    const mockClient = {
      from(table: string) {
        return {
          select(_cols: string) {
            return this;
          },
          eq(_col: string, _val: any) {
            return this;
          },
          order(_col: string, _opts: any) {
            return this;
          },
          limit(_n: number) {
            return this;
          },
          async maybeSingle() {
            if (table === "tenants") {
              return { data: { nombre_negocio: "Mi Restaurante", email: "fallback@tenant.com" }, error: null };
            }
            if (table === "tenant_users") {
              return { data: { email: "owner@admin.com" }, error: null };
            }
            return { data: null, error: null };
          },
        };
      },
    };

    const store = createSupabaseStore(mockClient);
    const info = await store.resolveTenantInfo("t1");

    expect(info.businessName).toBe("Mi Restaurante");
    expect(info.ownerEmail).toBe("owner@admin.com");
  });

  it("resolves public contact email from digital_menu_settings", async () => {
    const mockClient = {
      from(_table: string) {
        return {
          select(_cols: string) {
            return this;
          },
          eq(_col: string, _val: any) {
            return this;
          },
          order(_col: string, _opts: any) {
            return this;
          },
          limit(_n: number) {
            return this;
          },
          async maybeSingle() {
            return {
              data: {
                public_contact: {
                  suggestion_email: "sugerencias@sucursal.com",
                },
              },
              error: null,
            };
          },
        };
      },
    };

    const store = createSupabaseStore(mockClient);
    const email = await store.getPublicContactEmail("t1", "suc-1");

    expect(email).toBe("sugerencias@sucursal.com");
  });

  it("marks status as sent, failed, and skipped", async () => {
    const updateCalls: { table: string; values: any; eqCol: string; eqVal: any }[] = [];
    const mockClient = {
      from(table: string) {
        let currentValues: any = null;
        return {
          update(values: any) {
            currentValues = values;
            return this;
          },
          async eq(eqCol: string, eqVal: any) {
            updateCalls.push({ table, values: currentValues, eqCol, eqVal });
            return { data: null, error: null };
          },
        };
      },
    };

    const store = createSupabaseStore(mockClient);
    await store.markSent("s1");
    await store.markFailed("s2", "Resend 500");
    await store.markSkipped("s3", "No email");

    expect(updateCalls).toHaveLength(3);
    expect(updateCalls[0].values).toEqual({ email_status: "sent", email_error: null });
    expect(updateCalls[1].values).toEqual({ email_status: "failed", email_error: "Resend 500" });
    expect(updateCalls[2].values).toEqual({ email_status: "skipped", email_error: "No email" });
  });

  it("claimSuggestion rejects with the error message when the client returns { error }", async () => {
    const mockClient = {
      from(_table: string) {
        return {
          update(_values: any) {
            return this;
          },
          eq(_col: string, _val: any) {
            return this;
          },
          select(_fields: string) {
            return this;
          },
          async maybeSingle() {
            return {
              data: null,
              error: { message: "Database connection timeout during claim" },
            };
          },
        };
      },
    };

    const store = createSupabaseStore(mockClient);
    await expect(store.claimSuggestion("s1")).rejects.toThrow("Database connection timeout during claim");
  });

  it("claimSuggestion resolves null on { data: null, error: null } when row not found or already claimed", async () => {
    const mockClient = {
      from(_table: string) {
        return {
          update(_values: any) {
            return this;
          },
          eq(_col: string, _val: any) {
            return this;
          },
          select(_fields: string) {
            return this;
          },
          async maybeSingle() {
            return {
              data: null,
              error: null,
            };
          },
        };
      },
    };

    const store = createSupabaseStore(mockClient);
    const result = await store.claimSuggestion("s1");
    expect(result).toBeNull();
  });

  it("claimSuggestion resolves the row on success", async () => {
    const expectedRow: SuggestionRow = {
      id: "s-success",
      tenant_id: "t-1",
      sucursal_id: "suc-1",
      mesa_numero: 7,
      message: "Excelente comida",
      contact: "user@test.com",
      created_at: "2026-11-13T19:00:00Z",
      email_status: "sent",
      email_error: null,
    };

    const mockClient = {
      from(_table: string) {
        return {
          update(_values: any) {
            return this;
          },
          eq(_col: string, _val: any) {
            return this;
          },
          select(_fields: string) {
            return this;
          },
          async maybeSingle() {
            return {
              data: expectedRow,
              error: null,
            };
          },
        };
      },
    };

    const store = createSupabaseStore(mockClient);
    const result = await store.claimSuggestion("s-success");
    expect(result).toEqual(expectedRow);
  });

  it("markSent rejects with the error message when the client returns { error }", async () => {
    const mockClient = {
      from(_table: string) {
        return {
          update(_values: any) {
            return this;
          },
          async eq(_col: string, _val: any) {
            return { data: null, error: { message: "Failed to mark sent in Supabase" } };
          },
        };
      },
    };

    const store = createSupabaseStore(mockClient);
    await expect(store.markSent("s1")).rejects.toThrow("Failed to mark sent in Supabase");
  });

  it("markFailed rejects with the error message when the client returns { error }", async () => {
    const mockClient = {
      from(_table: string) {
        return {
          update(_values: any) {
            return this;
          },
          async eq(_col: string, _val: any) {
            return { data: null, error: { message: "Failed to mark failed in Supabase" } };
          },
        };
      },
    };

    const store = createSupabaseStore(mockClient);
    await expect(store.markFailed("s1", "Resend 500")).rejects.toThrow("Failed to mark failed in Supabase");
  });

  it("markSkipped rejects with the error message when the client returns { error }", async () => {
    const mockClient = {
      from(_table: string) {
        return {
          update(_values: any) {
            return this;
          },
          async eq(_col: string, _val: any) {
            return { data: null, error: { message: "Failed to mark skipped in Supabase" } };
          },
        };
      },
    };

    const store = createSupabaseStore(mockClient);
    await expect(store.markSkipped("s1", "No recipient")).rejects.toThrow("Failed to mark skipped in Supabase");
  });
});

