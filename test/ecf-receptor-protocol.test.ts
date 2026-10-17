import { describe, expect, it } from "vitest";
import {
  buildArecfXml,
  buildSeedXml,
  checkSeedValue,
  createSeedXml,
  digitsOnly,
  extractSubjectIdentifiers,
  generateSeedValueFor,
  decideReception,
  escapeXml,
  extractAcecfFields,
  extractEcfFields,
  extractSeedValue,
  formatAcuseDateTime,
  issueToken,
  normalizeRnc,
  parseBearerToken,
  parseReceptorPath,
  sha256Hex,
  validateApproval,
} from "../supabase/functions/ecf-receptor/protocol";
import { decodeEcfEncryptionKey, decryptPassphrase, NotConfiguredError } from "../supabase/functions/ecf-receptor/custody";

describe("parseReceptorPath", () => {
  it.each([
    ["/133488485/fe/autenticacion/api/semilla", "seed"],
    ["/ecf-receptor/133488485/fe/autenticacion/api/semilla", "seed"],
    ["/functions/v1/ecf-receptor/133488485/fe/autenticacion/api/semilla", "seed"],
    ["/ecf-receptor/133488485/fe/autenticacion/api/ValidacionCertificado", "validateSeed"],
    ["/ecf-receptor/133488485/FE/Autenticacion/API/validacioncertificado/", "validateSeed"],
    ["/ecf-receptor/133488485/fe/recepcion/api/ecf", "reception"],
    ["/ecf-receptor/133488485/fe/aprobacioncomercial/api/ecf", "approval"],
    ["/ecf-receptor/rnc_133488485/fe/recepcion/api/ecf", "reception"],
    ["/ecf-receptor/40212345678/fe/recepcion/api/ecf", "reception"],
  ])("routes %s", (path, service) => {
    const parsed = parseReceptorPath(path);
    expect(parsed?.service).toBe(service);
    expect(parsed?.rnc).toMatch(/^\d{9}$|^\d{11}$/);
  });

  it.each([
    "/",
    "/ecf-receptor",
    "/ecf-receptor/133488485",
    "/ecf-receptor/12345/fe/recepcion/api/ecf",
    "/ecf-receptor/abcdefghi/fe/recepcion/api/ecf",
    "/ecf-receptor/133488485/fe/recepcion/api/other",
    "/ecf-receptor/133488485/fe/recepcion/api/ecf/extra",
    "/ecf-receptor/../fe/recepcion/api/ecf",
  ])("rejects %s", (path) => {
    expect(parseReceptorPath(path)).toBeNull();
  });

  it("normalizes RNCs", () => {
    expect(normalizeRnc("133488485")).toBe("133488485");
    expect(normalizeRnc("133-488-485")).toBeNull();
  });
});

describe("seed and token", () => {
  const now = new Date("2026-10-17T20:00:00.000Z");

  it("builds the SemillaModel shape the dgii-ecf client expects", async () => {
    const xml = await createSeedXml("133488485", "secret", now);
    expect(xml).toContain('<SemillaModel xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">');
    expect(xml).toMatch(/<valor>[A-Za-z0-9+/]{75}=<\/valor>/);
    expect(xml).toContain("<fecha>2026-10-17T16:00:00.000-04:00</fecha>");
    expect(buildSeedXml("<&>", now)).toContain("<valor>&lt;&amp;&gt;</valor>");
  });

  it("issues stateless HMAC seeds bound to the RNC, secret and expiry", async () => {
    const valor = await generateSeedValueFor("133488485", "secret", now);
    const ok = await checkSeedValue(valor, "133488485", "secret", now);
    expect(ok.ok && ok.expiresAt.getTime() - now.getTime()).toBe(300_000);
    expect((await checkSeedValue(valor, "133488485", "secret", new Date(now.getTime() + 301_000))).ok).toBe(false);
    expect((await checkSeedValue(valor, "130862346", "secret", now)).ok).toBe(false);
    expect((await checkSeedValue(valor, "133488485", "other-secret", now)).ok).toBe(false);
    const tampered = valor.slice(0, 20) + (valor[20] === "A" ? "B" : "A") + valor.slice(21);
    expect((await checkSeedValue(tampered, "133488485", "secret", now)).ok).toBe(false);
    expect((await checkSeedValue("A".repeat(75) + "=", "133488485", "secret", now)).ok).toBe(false);
    expect((await checkSeedValue("short", "133488485", "secret", now)).ok).toBe(false);
    expect(valor).not.toBe(await generateSeedValueFor("133488485", "secret", now));
  });

  it("extracts the seed value from a signed seed and rejects other documents", () => {
    const signed = `<SemillaModel><valor>${"B".repeat(32)}</valor><fecha>x</fecha><Signature/></SemillaModel>`;
    expect(extractSeedValue(signed)).toBe("B".repeat(32));
    expect(extractSeedValue("<Other><valor>" + "B".repeat(32) + "</valor></Other>")).toBeNull();
    expect(extractSeedValue("<SemillaModel><valor>short</valor></SemillaModel>")).toBeNull();
  });

  it("issues a one-hour token shaped like dgii-ecf AuthToken and stores only its hash", async () => {
    const issued = await issueToken(now);
    expect(Object.keys(issued.response).sort()).toEqual(["expedido", "expira", "token"]);
    expect(issued.response.expedido).toBe(now.toISOString());
    expect(issued.response.expira).toBe("2026-10-17T21:00:00.000Z");
    expect(issued.hash).toBe(await sha256Hex(issued.token));
    expect(issued.hash).not.toContain(issued.token);
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("parses bearer tokens strictly", () => {
    expect(parseBearerToken("Bearer " + "a".repeat(43))).toBe("a".repeat(43));
    expect(parseBearerToken("bearer " + "a".repeat(43))).toBe("a".repeat(43));
    expect(parseBearerToken("Bearer short")).toBeNull();
    expect(parseBearerToken("Basic abc")).toBeNull();
    expect(parseBearerToken(null)).toBeNull();
  });
});

const ecf = (over: Partial<Record<string, string>> = {}) => `<ECF><Encabezado><IdDoc><TipoeCF>${over.tipo ?? "31"}</TipoeCF><eNCF>${over.encf ?? "E310000000007"}</eNCF></IdDoc><Emisor><RNCEmisor>${over.emisor ?? "131880738"}</RNCEmisor></Emisor><Comprador><RNCComprador>${over.comprador ?? "133488485"}</RNCComprador></Comprador></Encabezado></ECF>`;

describe("certificate identifiers", () => {
  const attrs = (...items: [string, string][]) => items.map(([type, value]) => ({ type, value }));

  it("reads ETSI organizationIdentifier and serialNumber encodings used by Dominican CAs", () => {
    expect(extractSubjectIdentifiers(attrs(["2.5.4.97", "VATDO-130862346"], ["2.5.4.5", "IDCDO-00112345678"]))).toEqual(["130862346", "00112345678"]);
    expect(extractSubjectIdentifiers(attrs(["2.5.4.5", "40212345678"]))).toEqual(["40212345678"]);
  });

  it("reads RNC embedded in O/OU/CN text", () => {
    expect(extractSubjectIdentifiers([{ shortName: "O", value: "ACME SRL - RNC 131880738" }])).toEqual(["131880738"]);
    expect(extractSubjectIdentifiers([{ shortName: "CN", value: "Juan RNC: 131880738" }])).toEqual(["131880738"]);
  });

  it("ignores passports, wrong lengths and unrelated attributes", () => {
    expect(extractSubjectIdentifiers(attrs(["2.5.4.5", "PA1234567"], ["2.5.4.97", "VATDO-123"], ["2.5.4.6", "DO"]))).toEqual([]);
    expect(extractSubjectIdentifiers([{ shortName: "L", value: "RNC 131880738" }])).toEqual([]);
    expect(extractSubjectIdentifiers([{ shortName: "CN", value: "no number here" }])).toEqual([]);
  });

  it("normalizes RNCs to digits", () => {
    expect(digitsOnly("1-33-48848-5")).toBe("133488485");
    expect(extractEcfFields(ecf({ emisor: "131-88073-8", comprador: "130 862 346" }))).toMatchObject({ rncEmisor: "131880738", rncComprador: "130862346" });
    expect(decideReception({ fields: extractEcfFields(ecf({ comprador: "133-488-485" })), signatureValid: true, tenantRnc: "133488485", isDuplicate: false })).toEqual({ estado: "0" });
  });
});

describe("reception rules", () => {
  const base = { tenantRnc: "133488485", signatureValid: true, isDuplicate: false };

  it("extracts e-CF fields and rejects malformed ones", () => {
    expect(extractEcfFields(ecf())).toEqual({ tipoEcf: "31", encf: "E310000000007", rncEmisor: "131880738", rncComprador: "133488485" });
    expect(extractEcfFields("<Other/>")).toBeNull();
    expect(extractEcfFields(ecf({ encf: "X1" }))).toBeNull();
  });

  it("accepts a valid document (Estado 0, no reason code)", () => {
    expect(decideReception({ ...base, fields: extractEcfFields(ecf()) })).toEqual({ estado: "0" });
  });

  it("applies the reason codes in order: specification, signature, buyer RNC, duplicate", () => {
    const fields = extractEcfFields(ecf());
    expect(decideReception({ ...base, fields: null })).toEqual({ estado: "1", codigo: "1" });
    expect(decideReception({ ...base, fields: extractEcfFields(ecf({ tipo: "32" })) })).toEqual({ estado: "1", codigo: "1" });
    expect(decideReception({ ...base, fields, signatureValid: false, isDuplicate: true })).toEqual({ estado: "1", codigo: "2" });
    expect(decideReception({ ...base, fields: extractEcfFields(ecf({ comprador: "999999999" })), isDuplicate: true })).toEqual({ estado: "1", codigo: "4" });
    expect(decideReception({ ...base, fields, isDuplicate: true })).toEqual({ estado: "1", codigo: "3" });
  });

  it("builds the ARECF with DGII field names and omits the reason when received", () => {
    const now = new Date("2026-04-15T19:21:55.000Z");
    const ok = buildArecfXml({ rncEmisor: "131880738", rncComprador: "133488485", encf: "E310000000007", decision: { estado: "0" }, now });
    expect(ok).toContain("<ARECF>");
    expect(ok).toContain("<Version>1.0</Version>");
    expect(ok).toContain("<Estado>0</Estado>");
    expect(ok).toContain("<FechaHoraAcuseRecibo>15-04-2026 15:21:55</FechaHoraAcuseRecibo>");
    expect(ok).not.toContain("CodigoMotivoNoRecibido");
    const rejected = buildArecfXml({ rncEmisor: "1", rncComprador: "2", encf: "E31", decision: { estado: "1", codigo: "4" }, now });
    expect(rejected).toContain("<Estado>1</Estado>\n    <CodigoMotivoNoRecibido>4</CodigoMotivoNoRecibido>");
  });

  it("formats the acknowledgement time on a 24 hour clock in UTC-4", () => {
    expect(formatAcuseDateTime(new Date("2026-01-01T02:05:09.000Z"))).toBe("31-12-2025 22:05:09");
  });

  it("escapes XML special characters", () => {
    expect(escapeXml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
  });
});

describe("commercial approval", () => {
  const acecf = (estado = "1", emisor = "133488485") => `<ACECF><DetalleAprobacionComercial><Version>1.0</Version><RNCEmisor>${emisor}</RNCEmisor><eNCF>E310000000007</eNCF><FechaEmision>01-01-2026</FechaEmision><MontoTotal>100.00</MontoTotal><RNCComprador>131880738</RNCComprador><Estado>${estado}</Estado><DetalleMotivoRechazo>motivo</DetalleMotivoRechazo></DetalleAprobacionComercial></ACECF>`;

  it("extracts ACECF fields", () => {
    expect(extractAcecfFields(acecf("2"))).toEqual({ rncEmisor: "133488485", rncComprador: "131880738", encf: "E310000000007", estado: 2, detalleMotivoRechazo: "motivo" });
    expect(extractAcecfFields(acecf("3"))).toBeNull();
    expect(extractAcecfFields("<ECF/>")).toBeNull();
  });

  it("requires a valid signature and the tenant as original issuer", () => {
    expect(validateApproval(extractAcecfFields(acecf()), true, "133488485")).toEqual({ ok: true });
    expect(validateApproval(extractAcecfFields(acecf()), false, "133488485")).toMatchObject({ ok: false, code: "SIGNATURE" });
    expect(validateApproval(extractAcecfFields(acecf("1", "111111111")), true, "133488485")).toMatchObject({ ok: false, code: "RNC_MISMATCH" });
    expect(validateApproval(null, true, "133488485")).toMatchObject({ ok: false, code: "SPECIFICATION" });
  });
});

describe("custody", () => {
  async function encrypt(passphrase: string, keyText: string): Promise<string> {
    const keyBytes = decodeEcfEncryptionKey(keyText);
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const out = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(passphrase)));
    const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `aes256gcm:${hex(iv)}:${hex(out.slice(-16))}:${hex(out.slice(0, -16))}`;
  }
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const keyText = "ecf-v1:" + btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  it("decrypts what validate-ecf-certificate encrypts", async () => {
    expect(await decryptPassphrase(await encrypt("s3cret-ñ", keyText), keyText)).toBe("s3cret-ñ");
  });

  it("fails closed with non-secret errors when the key is missing or malformed", async () => {
    const stored = await encrypt("x", keyText);
    await expect(decryptPassphrase(stored, undefined)).rejects.toBeInstanceOf(NotConfiguredError);
    await expect(decryptPassphrase(stored, "ecf-v1:short")).rejects.toThrow("invalid format");
    await expect(decryptPassphrase(stored, "ecf-v1:" + "A".repeat(43))).rejects.toThrow(NotConfiguredError);
    try {
      await decryptPassphrase(stored, "ecf-v1:" + "A".repeat(43));
    } catch (error) {
      expect(String(error)).not.toContain("AAAA");
    }
  });

  it("rejects a wrong key and tampered ciphertext", async () => {
    const other = "ecf-v1:" + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await expect(decryptPassphrase(await encrypt("x", keyText), other)).rejects.toThrow();
    await expect(decryptPassphrase("plaintext", keyText)).rejects.toThrow("Unsupported");
  });
});
