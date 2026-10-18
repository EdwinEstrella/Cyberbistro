import { describe, expect, it } from "vitest";
import { TestSetError } from "../supabase/functions/ecf-certification/builder";
import {
  buildCommercialApprovals,
  detectWorkbookType,
  isDgiiDateTime,
} from "../supabase/functions/ecf-certification/commercialApproval";
import { DgiiError, createDgiiClient, dgiiUrls, parseMessages } from "../supabase/functions/ecf-certification/dgiiClient";
import type { Sheet } from "../supabase/functions/ecf-certification/xlsx";

const HEADER = ["Version", "RNCEmisor", "eNCF", "FechaEmision", "MontoTotal", "RNCComprador", "Estado", "DetalleMotivoRechazo", "FechaHoraAprobacionComercial"];
const row = (over: Partial<Record<(typeof HEADER)[number], string>> = {}): string[] => {
  const base: Record<string, string> = {
    Version: "1.0",
    RNCEmisor: "131880681",
    eNCF: "E310000000001",
    FechaEmision: "01-04-2020",
    MontoTotal: "1180.00",
    RNCComprador: "133488485",
    Estado: "1",
    DetalleMotivoRechazo: "",
    FechaHoraAprobacionComercial: "18-10-2026 17:26:04",
    ...over,
  };
  return HEADER.map((name) => base[name]);
};
const sheet = (...rows: string[][]): Sheet => ({ name: "ACEECF_Generadas", rows: [HEADER, ...rows] });
const NOW = new Date("2026-10-18T21:30:45Z"); // 17:30:45 in DR time

describe("detectWorkbookType", () => {
  it("classifies by sheet name", () => {
    expect(detectWorkbookType([{ name: "ECF", rows: [] }])).toBe("test_set");
    expect(detectWorkbookType([{ name: " rfce ", rows: [] }])).toBe("test_set");
    expect(detectWorkbookType([{ name: "aceecf_generadas", rows: [] }])).toBe("commercial_approval");
  });

  it("rejects mixed and unknown workbooks with a clear detail", () => {
    expect(() => detectWorkbookType([{ name: "ECF", rows: [] }, { name: "ACEECF_Generadas", rows: [] }])).toThrow(/mixes/);
    expect(() => detectWorkbookType([{ name: "Hoja1", rows: [] }])).toThrow(TestSetError);
    expect(() => detectWorkbookType([{ name: "Hoja1", rows: [] }])).toThrow(/ACEECF_Generadas/);
  });
});

describe("buildCommercialApprovals", () => {
  it("builds one ACECF per row in IACECF order, omitting an empty DetalleMotivoRechazo", () => {
    const [first, second] = buildCommercialApprovals([sheet(row(), row({ eNCF: "E310000000002" }))], NOW);
    expect(first).toMatchObject({ caseId: "133488485E310000000001", encf: "E310000000001", tipoEcf: "31", rncComprador: "133488485", estado: "1" });
    expect(second.caseId).toBe("133488485E310000000002");
    expect(first.xml).toBe(
      '<?xml version="1.0" encoding="utf-8"?><ACECF><DetalleAprobacionComercial>' +
        "<Version>1.0</Version><RNCEmisor>131880681</RNCEmisor><eNCF>E310000000001</eNCF><FechaEmision>01-04-2020</FechaEmision>" +
        "<MontoTotal>1180.00</MontoTotal><RNCComprador>133488485</RNCComprador><Estado>1</Estado>" +
        "<FechaHoraAprobacionComercial>18-10-2026 17:26:04</FechaHoraAprobacionComercial></DetalleAprobacionComercial></ACECF>",
    );
  });

  it("requires and places the rejection reason between Estado and the approval time for Estado 2", () => {
    const [built] = buildCommercialApprovals([sheet(row({ Estado: "2", DetalleMotivoRechazo: "Precio <> pactado & mas" }))], NOW);
    expect(built.estado).toBe("2");
    expect(built.xml).toContain("<Estado>2</Estado><DetalleMotivoRechazo>Precio &lt;&gt; pactado &amp; mas</DetalleMotivoRechazo><FechaHoraAprobacionComercial>");
    expect(() => buildCommercialApprovals([sheet(row({ Estado: "2" }))], NOW)).toThrow(/DetalleMotivoRechazo is required/);
    expect(() => buildCommercialApprovals([sheet(row({ Estado: "1", DetalleMotivoRechazo: "x" }))], NOW)).toThrow(/only allowed when Estado is 2/);
  });

  it("keeps a valid sheet timestamp and falls back to the current DR time otherwise", () => {
    expect(buildCommercialApprovals([sheet(row({ FechaHoraAprobacionComercial: "" }))], NOW)[0].xml).toContain(
      "<FechaHoraAprobacionComercial>18-10-2026 17:30:45</FechaHoraAprobacionComercial>",
    );
    expect(buildCommercialApprovals([sheet(row({ FechaHoraAprobacionComercial: "2026-10-18" }))], NOW)[0].xml).toContain("18-10-2026 17:30:45");
    expect(buildCommercialApprovals([sheet(row({ FechaHoraAprobacionComercial: "31-02-2026 10:00:00" }))], NOW)[0].xml).toContain("18-10-2026 17:30:45");
    expect(isDgiiDateTime("18-10-2026 17:26:04")).toBe(true);
    expect(isDgiiDateTime("18-10-2026 24:00:00")).toBe(false);
  });

  it("defaults the version and ignores a missing optional column", () => {
    const columns = HEADER.filter((name) => !["Version", "DetalleMotivoRechazo", "FechaHoraAprobacionComercial"].includes(name));
    const values = row();
    const picked = columns.map((name) => values[HEADER.indexOf(name)]);
    const [built] = buildCommercialApprovals([{ name: "ACEECF_Generadas", rows: [columns, picked] }], NOW);
    expect(built.xml).toContain("<Version>1.0</Version>");
    expect(built.xml).toContain("18-10-2026 17:30:45");
  });

  it.each([
    [{ Estado: "3" }, /Estado must be 1/],
    [{ eNCF: "B0100000001" }, /eNCF is missing or invalid/],
    [{ RNCComprador: "12" }, /RNCComprador is missing or invalid/],
    [{ RNCEmisor: "" }, /RNCEmisor is missing or invalid/],
    [{ FechaEmision: "2020-04-01" }, /FechaEmision/],
    [{ MontoTotal: "abc" }, /MontoTotal/],
  ])("rejects invalid rows %j", (over, message) => {
    expect(() => buildCommercialApprovals([sheet(row(over))], NOW)).toThrow(message);
  });

  it("rejects duplicates, unsupported columns with data, missing columns and empty sheets", () => {
    expect(() => buildCommercialApprovals([sheet(row(), row())], NOW)).toThrow(/more than once/);
    expect(() => buildCommercialApprovals([{ name: "ACEECF_Generadas", rows: [[...HEADER, "Extra"], [...row(), "dato"]] }], NOW)).toThrow(/not supported/);
    expect(() => buildCommercialApprovals([{ name: "ACEECF_Generadas", rows: [HEADER.filter((name) => name !== "Estado")] }], NOW)).toThrow(/Estado column is missing/);
    expect(() => buildCommercialApprovals([sheet()], NOW)).toThrow(/no rows/);
    expect(() => buildCommercialApprovals([sheet(["", "", "", "", "", "", "", "", ""])], NOW)).toThrow(/no rows/);
  });
});

describe("DGII commercial approval client", () => {
  const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  function mock(response: () => Response) {
    const calls: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = init?.body;
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
        body: raw instanceof Uint8Array ? new TextDecoder().decode(raw) : "",
      });
      return response();
    }) as typeof fetch;
    return { impl, calls };
  }

  it.each([
    ["test", "TesteCF"],
    ["certification", "CerteCF"],
    ["production", "eCF"],
  ] as const)("composes the %s endpoint like dgii-ecf", (environment, path) => {
    expect(dgiiUrls(environment).sendCommercialApproval).toBe(`https://ecf.dgii.gov.do/${path}/aprobacionComercial/api/AprobacionComercial`);
  });

  it("posts a fixed-length multipart xml part with the bearer token and never retries", async () => {
    const { impl, calls } = mock(() => jsonResponse(200, { codigo: "01", estado: "Aprobación Comercial Aprobada.", mensaje: [] }));
    const client = createDgiiClient({ environment: "certification", fetch: impl, boundary: () => "BOUND" });
    const result = await client.sendCommercialApproval("TKN", "133488485E310000000001.xml", "<ACECF/>");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://ecf.dgii.gov.do/CerteCF/aprobacionComercial/api/AprobacionComercial");
    expect(calls[0].headers.Authorization).toBe("Bearer TKN");
    expect(calls[0].headers["Content-Type"]).toBe("multipart/form-data; boundary=BOUND");
    expect(calls[0].body).toBe(
      '--BOUND\r\nContent-Disposition: form-data; name="xml"; filename="133488485E310000000001.xml"\r\nContent-Type: text/xml\r\n\r\n<ACECF/>\r\n--BOUND--\r\n',
    );
    expect(result).toEqual({ httpStatus: 200, trackId: null, estado: "Aprobación Comercial Aprobada.", codigo: 1, messages: [] });
  });

  it("maps the rejected answer and its mensaje list", async () => {
    const { impl } = mock(() => jsonResponse(200, { codigo: "02", estado: "Aprobacion Comercial Rechazada.", mensaje: ["El e-NCF no existe", " "] }));
    const result = await createDgiiClient({ environment: "test", fetch: impl }).sendCommercialApproval("T", "a.xml", "<ACECF/>");
    expect(result).toMatchObject({ codigo: 2, estado: "Aprobacion Comercial Rechazada.", messages: [{ codigo: null, valor: "El e-NCF no existe" }] });
  });

  it("parses a single-string mensaje and 4xx JSON bodies", async () => {
    expect(parseMessages({ mensaje: "Solo uno" })).toEqual([{ codigo: null, valor: "Solo uno" }]);
    const { impl } = mock(() => jsonResponse(400, { mensaje: ["XML invalido"] }));
    const result = await createDgiiClient({ environment: "test", fetch: impl }).sendCommercialApproval("T", "a.xml", "<ACECF/>");
    expect(result).toMatchObject({ httpStatus: 400, codigo: null, messages: [{ codigo: null, valor: "XML invalido" }] });
  });

  it("fails on auth, server errors, network failures and non-JSON answers", async () => {
    const run = (response: () => Response) => createDgiiClient({ environment: "test", fetch: mock(response).impl }).sendCommercialApproval("T", "a.xml", "<ACECF/>");
    await expect(run(() => new Response("", { status: 401 }))).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(run(() => new Response("boom", { status: 503 }))).rejects.toMatchObject({ kind: "http", status: 503 });
    await expect(run(() => new Response("<html/>", { status: 200 }))).rejects.toMatchObject({ kind: "invalid_response" });
    const failing = createDgiiClient({
      environment: "test",
      fetch: (async () => {
        throw new TypeError("offline");
      }) as typeof fetch,
    });
    await expect(failing.sendCommercialApproval("T", "a.xml", "<ACECF/>")).rejects.toBeInstanceOf(DgiiError);
  });

  it("rejects unsafe file names before any request", async () => {
    const { impl, calls } = mock(() => jsonResponse(200, {}));
    await expect(createDgiiClient({ environment: "test", fetch: impl }).sendCommercialApproval("T", "../x.xml", "<ACECF/>")).rejects.toThrow(/Invalid file name/);
    expect(calls).toHaveLength(0);
  });
});
