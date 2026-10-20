// Structural checks on the XML a caller asks us to sign. This is what stops the function from
// becoming a generic signing oracle: allow-listed roots, no DTD/entities, no existing signature,
// and the contribuyente RNC must be the tenant's.
import { DOMParser } from "npm:@xmldom/xmldom@0.8.12";

export type DocumentType = "postulacion" | "declaracion_jurada";

/**
 * Allow-list of root elements per document type. `Postulacion` is the root of the DGII postulacion
 * XML. The exact DGII root name of the declaracion jurada must be confirmed against the document
 * downloaded from the DGII portal; `DeclaracionJurada` is the accepted name until then.
 */
export const ALLOWED_ROOTS: Record<DocumentType, readonly string[]> = {
  postulacion: ["Postulacion"],
  declaracion_jurada: ["DeclaracionJurada"],
};

/** Local names that carry the contribuyente RNC (representative and provider RNCs use other tags). */
const RNC_ELEMENT = /^(rnc|rnccedula|rncemisor|rnccontribuyente)$/i;
const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";

export type DocumentFailure = "FORBIDDEN_XML" | "INVALID_XML" | "WRONG_ROOT" | "ALREADY_SIGNED" | "RNC_MISMATCH";

export type DocumentAnalysis = { ok: true; rootElement: string } | { ok: false; failure: DocumentFailure };

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ALLOWED_ROOTS, value);
}

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** DTDs, entities, comments, CDATA and processing instructions (other than the XML declaration). */
export function hasForbiddenXml(xml: string): boolean {
  if (/<!DOCTYPE|<!ENTITY|<!--|<!\[CDATA\[/i.test(xml)) return true;
  const withoutDeclaration = xml.replace(/^\uFEFF?\s*<\?xml\s[^>]*\?>/, "");
  return withoutDeclaration.includes("<?");
}

/** xmldom tolerates mismatched tags; require balanced, properly nested elements before trusting its tree. */
function isBalanced(xml: string): boolean {
  const stack: string[] = [];
  let roots = 0;
  for (const match of xml.matchAll(/<(\/?)([^\s>/!?]+)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = match;
    if (closing) {
      if (stack.pop() !== name) return false;
    } else if (!selfClosing) {
      if (stack.length === 0) roots++;
      stack.push(name);
    } else if (stack.length === 0) {
      roots++;
    }
  }
  return stack.length === 0 && roots === 1;
}

// deno-lint-ignore no-explicit-any
type XmlNode = any;

function collect(node: XmlNode, rncs: string[], state: { signed: boolean }): void {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue;
    const local: string = child.localName || child.nodeName;
    if (local === "Signature" && (!child.namespaceURI || child.namespaceURI === DSIG_NS)) state.signed = true;
    if (RNC_ELEMENT.test(local)) rncs.push(digitsOnly(child.textContent));
    collect(child, rncs, state);
  }
}

/** `<DeclaracionJurada>` as downloaded from the DGII portal: a single `<DetalleGeneral>` holding only non-empty text. */
function isDgiiDeclarationShape(root: XmlNode): boolean {
  const elements: XmlNode[] = [];
  for (let child = root.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) elements.push(child);
    else if (child.nodeType !== 3 || (child.nodeValue ?? "").trim() !== "") return false;
  }
  if (elements.length !== 1 || (elements[0].localName || elements[0].nodeName) !== "DetalleGeneral") return false;
  const detail = elements[0];
  for (let child = detail.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 3) return false;
  }
  return (detail.textContent ?? "").trim() !== "";
}

export function analyzeDocument(xml: string, documentType: DocumentType, tenantRnc: string): DocumentAnalysis {
  if (hasForbiddenXml(xml)) return { ok: false, failure: "FORBIDDEN_XML" };
  if (!isBalanced(xml)) return { ok: false, failure: "INVALID_XML" };

  let invalid = false;
  const parser = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: () => {
        invalid = true;
      },
      fatalError: () => {
        invalid = true;
      },
    },
  });
  let root: XmlNode;
  try {
    root = parser.parseFromString(xml, "text/xml")?.documentElement;
  } catch {
    return { ok: false, failure: "INVALID_XML" };
  }
  if (invalid || !root) return { ok: false, failure: "INVALID_XML" };

  const rootName: string = root.localName || root.nodeName;
  if (!ALLOWED_ROOTS[documentType].includes(rootName)) return { ok: false, failure: "WRONG_ROOT" };

  const rncs: string[] = [];
  const state = { signed: false };
  collect(root, rncs, state);
  if (state.signed) return { ok: false, failure: "ALREADY_SIGNED" };

  const expected = digitsOnly(tenantRnc);
  const found = rncs.filter((rnc) => rnc !== "");
  // The DGII declaracion jurada carries no RNC: only its exact shape (legal text, nothing else) may skip the check.
  if (documentType === "declaracion_jurada" && found.length === 0 && isDgiiDeclarationShape(root)) {
    return { ok: true, rootElement: rootName };
  }
  if (!expected || found.length === 0 || found.some((rnc) => rnc !== expected)) {
    return { ok: false, failure: "RNC_MISMATCH" };
  }
  return { ok: true, rootElement: rootName };
}
