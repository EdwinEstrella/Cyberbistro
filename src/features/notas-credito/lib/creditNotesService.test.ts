import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async (..._args: unknown[]) => ({ data: null, error: null }) as { data: unknown; error: unknown });
vi.mock("../../../shared/lib/supabase", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock("../../../shared/lib/localFirst", () => ({ readLocalMirror: vi.fn(), shouldReadLocalFirst: vi.fn() }));
vi.mock("../../billing/lib/invoicesLocal", () => ({ readLocalInvoices: vi.fn() }));

import { issueCreditNote, resolveRpcBranchId } from "./creditNotesService";

afterEach(() => vi.clearAllMocks());

const BRANCH = "7b0a5f8e-1c2d-4e3f-9a4b-5c6d7e8f9a0b";
const input = { tenantId: "t1", facturaId: "f1", reason: "Devolución", sucursalId: BRANCH };

describe("resolveRpcBranchId", () => {
  it("keeps uuids and nulls sentinels", () => {
    expect(resolveRpcBranchId(BRANCH)).toBe(BRANCH);
    expect(resolveRpcBranchId("main-process-default")).toBeNull();
    expect(resolveRpcBranchId(undefined)).toBeNull();
  });
});

describe("issueCreditNote", () => {
  it("calls cloudix_issue_credit_note with the RPC argument names", async () => {
    const result = { credit_note_factura_id: "n1", encf: "E340000000001", ecf_document_id: "d1", gasto_id: "g1" };
    rpc.mockResolvedValueOnce({ data: result, error: null });
    await expect(issueCreditNote(input)).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith("cloudix_issue_credit_note", {
      p_tenant_id: "t1",
      p_factura_id: "f1",
      p_razon: "Devolución",
      p_sucursal_id: BRANCH,
    });
  });
  it("throws the mapped Spanish message for RPC errors", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "CREDIT_NOTE_NO_OPEN_CYCLE" } });
    await expect(issueCreditNote(input)).rejects.toThrow(/caja/);
  });
  it("maps thrown network failures", async () => {
    rpc.mockRejectedValueOnce(new TypeError("Failed to fetch (cloud is offline)"));
    await expect(issueCreditNote(input)).rejects.toThrow(/conexión/);
  });
});
