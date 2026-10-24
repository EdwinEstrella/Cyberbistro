import { describe, expect, it } from "vitest";
import {
  DgiiError,
  buildMultipart,
  createDgiiClient,
  dgiiUrls,
  parseMessages,
  type DgiiEnvironment,
} from "../supabase/functions/ecf-certification/dgiiClient";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

type Responder = (call: Call) => Response | Promise<Response>;

function mockFetch(responders: Responder[]) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const raw = init?.body;
    const body = raw instanceof Uint8Array ? new TextDecoder().decode(raw) : typeof raw === "string" ? raw : "";
    const call = { url: String(input), method: init?.method ?? "GET", headers, body };
    calls.push(call);
    const next = responders.shift();
    if (!next) throw new Error("unexpected fetch");
    return next(call);
  }) as typeof fetch;
  return { impl, calls };
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const SEED = '<?xml version="1.0" encoding="utf-8"?><SemillaModel><valor>abc</valor><fecha>2026-10-18T10:00:00</fecha></SemillaModel>';

describe("dgii urls", () => {
  it.each<[DgiiEnvironment, string]>([
    ["test", "TesteCF"],
    ["certification", "CerteCF"],
    ["production", "eCF"],
  ])("composes %s endpoints like dgii-ecf", (environment, path) => {
    const urls = dgiiUrls(environment);
    expect(urls.seed).toBe(`https://ecf.dgii.gov.do/${path}/Autenticacion/api/Autenticacion/Semilla`);
    expect(urls.validateSeed).toBe(`https://ecf.dgii.gov.do/${path}/autenticacion/api/Autenticacion/ValidarSemilla`);
    expect(urls.sendEcf).toBe(`https://ecf.dgii.gov.do/${path}/recepcion/api/FacturasElectronicas`);
    expect(urls.sendRfce).toBe(`https://fc.dgii.gov.do/${path}/recepcionfc/api/recepcion/ecf`);
    expect(urls.trackStatus).toBe(`https://ecf.dgii.gov.do/${path}/consultaresultado/api/Consultas/Estado`);
  });
});

describe("multipart body", () => {
  it("sends a single xml file part with a fixed length", () => {
    const { body, contentType } = buildMultipart("133488485E310000000001.xml", "<ECF>á</ECF>", "BOUND");
    expect(contentType).toBe("multipart/form-data; boundary=BOUND");
    const text = new TextDecoder().decode(body);
    expect(text).toBe(
      '--BOUND\r\nContent-Disposition: form-data; name="xml"; filename="133488485E310000000001.xml"\r\nContent-Type: text/xml\r\n\r\n<ECF>á</ECF>\r\n--BOUND--\r\n',
    );
  });

  it("refuses unsafe file names", () => {
    expect(() => buildMultipart('a"b.xml', "<x/>", "B")).toThrow();
    expect(() => buildMultipart("a/b.xml", "<x/>", "B")).toThrow();
  });
});

describe("dgii client", () => {
  it("authenticates: GET seed, signs SemillaModel, posts it as multipart and returns the token", async () => {
    const { impl, calls } = mockFetch([
      () => new Response(SEED, { status: 200 }),
      () => jsonResponse(200, { token: "TKN", expira: "2026-10-18T11:00:00", expedido: "2026-10-18T10:00:00" }),
    ]);
    const signed: string[] = [];
    const client = createDgiiClient({ environment: "certification", fetch: impl, boundary: () => "B" });
    const token = await client.authenticate((seed) => {
      signed.push(seed);
      return seed.replace("</SemillaModel>", "<Signature/></SemillaModel>");
    });
    expect(token).toEqual({ token: "TKN", expiresAt: "2026-10-18T11:00:00", issuedAt: "2026-10-18T10:00:00" });
    expect(signed).toEqual([SEED]);
    expect(calls[0]).toMatchObject({ method: "GET", url: dgiiUrls("certification").seed });
    expect(calls[1].url).toBe(dgiiUrls("certification").validateSeed);
    expect(calls[1].method).toBe("POST");
    expect(calls[1].headers["Content-Type"]).toBe("multipart/form-data; boundary=B");
    expect(calls[1].headers.Authorization).toBeUndefined();
    expect(calls[1].body).toContain('name="xml"; filename="signed.xml"');
    expect(calls[1].body).toContain("<Signature/></SemillaModel>");
  });

  it("maps a rejected seed validation to unauthorized with the DGII messages", async () => {
    const { impl } = mockFetch([
      () => new Response(SEED, { status: 200 }),
      () => jsonResponse(400, { mensajes: [{ codigo: 1, valor: "Certificado no valido" }] }),
    ]);
    const client = createDgiiClient({ environment: "test", fetch: impl });
    const error = await client.authenticate((s) => s).catch((e) => e);
    expect(error).toBeInstanceOf(DgiiError);
    expect(error.kind).toBe("unauthorized");
    expect(error.messages).toEqual([{ codigo: "1", valor: "Certificado no valido" }]);
  });

  it("rejects a seed response that is not a SemillaModel", async () => {
    const { impl } = mockFetch([() => new Response("<html>maintenance</html>", { status: 200 })]);
    const error = await createDgiiClient({ environment: "test", fetch: impl }).authenticate((s) => s).catch((e) => e);
    expect(error.kind).toBe("invalid_response");
  });

  it("retries an idempotent call once on a network error, never more", async () => {
    const boom = () => {
      throw new TypeError("connection reset");
    };
    const twice = mockFetch([boom, () => new Response(SEED), () => jsonResponse(200, { token: "T" })]);
    await expect(createDgiiClient({ environment: "test", fetch: twice.impl }).authenticate((s) => s)).resolves.toMatchObject({ token: "T" });
    expect(twice.calls).toHaveLength(3);

    const always = mockFetch([boom, boom, boom]);
    const error = await createDgiiClient({ environment: "test", fetch: always.impl }).authenticate((s) => s).catch((e) => e);
    expect(error.kind).toBe("network");
    expect(always.calls).toHaveLength(2);
  });

  it("does not retry submissions (a resend would reuse the sequence)", async () => {
    const { impl, calls } = mockFetch([
      () => {
        throw new TypeError("reset");
      },
    ]);
    const error = await createDgiiClient({ environment: "test", fetch: impl }).sendEcf("T", "1E31.xml", "<ECF/>").catch((e) => e);
    expect(error.kind).toBe("network");
    expect(calls).toHaveLength(1);
  });

  it("times out slow calls", async () => {
    const hang: typeof fetch = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as typeof fetch;
    const error = await createDgiiClient({ environment: "test", fetch: hang, timeoutMs: 10 }).trackStatus("T", "x").catch((e) => e);
    expect(error.kind).toBe("timeout");
  });

  it("sends an e-CF with the bearer token and returns the trackId", async () => {
    const { impl, calls } = mockFetch([() => jsonResponse(200, { trackId: "abc-123", error: null, mensajes: [] })]);
    const client = createDgiiClient({ environment: "certification", fetch: impl, boundary: () => "B" });
    const result = await client.sendEcf("TKN", "133488485E310000000001.xml", "<ECF/>");
    expect(result).toEqual({ httpStatus: 200, trackId: "abc-123", estado: null, codigo: null, messages: [] });
    expect(calls[0].url).toBe(dgiiUrls("certification").sendEcf);
    expect(calls[0].headers.Authorization).toBe("Bearer TKN");
    expect(calls[0].body).toContain('filename="133488485E310000000001.xml"');
  });

  it("sends an RFCE to the fc host and parses the synchronous answer", async () => {
    const { impl, calls } = mockFetch([
      () => jsonResponse(200, { codigo: 1, estado: "Aceptado", mensajes: [], encf: "E320000000012", secuenciaUtilizada: true }),
    ]);
    const result = await createDgiiClient({ environment: "certification", fetch: impl }).sendRfce("TKN", "1E32.xml", "<RFCE/>");
    expect(calls[0].url.startsWith("https://fc.dgii.gov.do/CerteCF/")).toBe(true);
    expect(result).toMatchObject({ estado: "Aceptado", codigo: 1, trackId: null });
  });

  it("returns 4xx answers with a JSON body as results so the caller can record the rejection", async () => {
    const { impl } = mockFetch([() => jsonResponse(400, { trackId: null, error: "XML invalido", mensajes: [{ valor: "Campo X", codigo: 2 }] })]);
    const result = await createDgiiClient({ environment: "test", fetch: impl }).sendEcf("T", "a.xml", "<ECF/>");
    expect(result.httpStatus).toBe(400);
    expect(result.messages).toEqual([
      { codigo: "2", valor: "Campo X" },
      { codigo: null, valor: "XML invalido" },
    ]);
  });

  it("maps 401 to unauthorized and 5xx to http errors", async () => {
    const unauthorized = mockFetch([() => new Response("", { status: 401 })]);
    expect((await createDgiiClient({ environment: "test", fetch: unauthorized.impl }).sendEcf("T", "a.xml", "<x/>").catch((e) => e)).kind).toBe(
      "unauthorized",
    );
    const down = mockFetch([() => new Response("oops", { status: 503 }), () => new Response("oops", { status: 503 })]);
    const error = await createDgiiClient({ environment: "test", fetch: down.impl }).trackStatus("T", "x").catch((e) => e);
    expect(error.kind).toBe("http");
    expect(error.status).toBe(503);
  });

  it("queries the trackId status with the token", async () => {
    const { impl, calls } = mockFetch([
      () => jsonResponse(200, { trackId: "t 1", codigo: 2, estado: "Rechazado", encf: "E310000000001", mensajes: [{ valor: "Monto", codigo: 7 }] }),
    ]);
    const result = await createDgiiClient({ environment: "certification", fetch: impl }).trackStatus("TKN", "t 1");
    expect(calls[0].url).toBe(`${dgiiUrls("certification").trackStatus}?trackId=t%201`);
    expect(calls[0].headers.Authorization).toBe("Bearer TKN");
    expect(result).toEqual({ trackId: "t 1", estado: "Rechazado", codigo: 2, encf: "E310000000001", messages: [{ codigo: "7", valor: "Monto" }] });
  });

  it("rejects oversized responses", async () => {
    const { impl } = mockFetch([() => new Response("x".repeat(300 * 1024), { status: 200 })]);
    const error = await createDgiiClient({ environment: "test", fetch: impl }).sendEcf("T", "a.xml", "<x/>").catch((e) => e);
    expect(error.kind).toBe("invalid_response");
  });
});

describe("parseMessages", () => {
  it("is defensive about shapes and bounds the output", () => {
    expect(parseMessages(null)).toEqual([]);
    expect(parseMessages({ mensajes: "nope" })).toEqual([]);
    expect(parseMessages({ mensajes: ["texto", { mensaje: "otro" }, 5, {}] })).toEqual([
      { codigo: null, valor: "texto" },
      { codigo: null, valor: "otro" },
    ]);
    const many = parseMessages({ mensajes: Array.from({ length: 40 }, (_, i) => ({ valor: "x".repeat(900), codigo: i })) });
    expect(many).toHaveLength(20);
    expect(many[0].valor.length).toBeLessThanOrEqual(503);
  });

  it("drops DGII placeholder messages with an empty valor", () => {
    expect(parseMessages({ mensajes: [{ codigo: 0, valor: "" }] })).toEqual([]);
    expect(parseMessages({ mensajes: [{ codigo: 0, valor: "  " }, { codigo: 7, valor: "Falta RNC" }] })).toEqual([{ codigo: "7", valor: "Falta RNC" }]);
  });
});
