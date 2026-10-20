import { describe, expect, it, vi } from "vitest";
import React from "react";
import { ReceivedEvidencePanel, approvalRows, documentRows } from "./ReceivedEvidencePanel";

function findInTree(tree: any, predicate: (node: any) => boolean): any[] {
  const results: any[] = [];
  const recurse = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) results.push(node);
    if (node.props?.children) React.Children.forEach(node.props.children, recurse);
  };
  recurse(tree);
  return results;
}

function textOf(tree: any): string {
  let out = "";
  const recurse = (node: any) => {
    if (node == null || typeof node === "boolean") return;
    if (typeof node === "string" || typeof node === "number") {
      out += String(node);
      return;
    }
    if (node.props?.children) React.Children.forEach(node.props.children, recurse);
  };
  recurse(tree);
  return out;
}

const doc = (over: Record<string, unknown> = {}) =>
  ({
    id: "d1",
    tenant_id: "t",
    emisor_rnc: "131880681",
    comprador_rnc: "1",
    encf: "E310000000001",
    tipo_ecf: 31,
    estado: 0,
    motivo_no_recibido: null,
    received_at: "2026-10-20T12:00:00Z",
    signer_rnc_mismatch: false,
    ...over,
  }) as any;

describe("row mappers", () => {
  it("labels received and not-received documents", () => {
    const rows = documentRows([doc(), doc({ id: "d2", estado: 1, motivo_no_recibido: 3 })]);
    expect(rows[0]).toMatchObject({ encf: "E310000000001", emisorRnc: "131880681", tipo: "E31", estado: "Recibido", accepted: true });
    expect(rows[1]).toMatchObject({ estado: "No recibido (código 3)", accepted: false });
  });

  it("labels approvals", () => {
    const rows = approvalRows([
      { id: "a1", estado: 1, encf: "E31", emisor_rnc: "1", received_at: null } as any,
      { id: "a2", estado: 2, encf: "E32", emisor_rnc: "1", received_at: null } as any,
    ]);
    expect(rows.map((row) => row.estado)).toEqual(["Aprobado", "Rechazado"]);
    expect(rows[0].fecha).toBe("—");
  });
});

describe("ReceivedEvidencePanel", () => {
  const base = { title: "e-CF recibidos", loading: false, error: null, emptyText: "Aún no llegó nada.", onRefresh: () => {} };

  it("renders rows", () => {
    const text = textOf(ReceivedEvidencePanel({ ...base, rows: documentRows([doc()]) }));
    expect(text).toContain("E310000000001");
    expect(text).toContain("Recibido");
    expect(text).not.toContain("Aún no llegó nada.");
  });

  it("renders the empty state", () => {
    expect(textOf(ReceivedEvidencePanel({ ...base, rows: [] }))).toContain("Aún no llegó nada.");
  });

  it("renders the error state", () => {
    expect(textOf(ReceivedEvidencePanel({ ...base, rows: [], error: "boom" }))).toContain("No se pudo leer lo recibido: boom");
  });

  it("wires the Actualizar button to onRefresh", () => {
    const onRefresh = vi.fn();
    const tree = ReceivedEvidencePanel({ ...base, rows: [], onRefresh });
    findInTree(tree, (node) => node.type === "button")[0].props.onClick();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
