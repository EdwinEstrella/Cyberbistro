import { describe, expect, it, vi } from "vitest";
import { reenqueueEcfDocument } from "./reenqueueEcfDocument";

describe("reenqueueEcfDocument", () => {
  it("calls the trusted RPC boundary with tenant and document identifiers", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, outbox_id: "outbox-1", status: "pending_sync", idempotent: false },
      error: null,
    });

    const result = await reenqueueEcfDocument({
      client: { database: { rpc } },
      tenantId: "tenant-1",
      ecfDocumentId: "doc-1",
    });

    expect(rpc).toHaveBeenCalledWith("cloudix_reenqueue_ecf_document", {
      p_tenant_id: "tenant-1",
      p_ecf_document_id: "doc-1",
    });
    expect(result).toEqual({
      ok: true,
      outboxId: "outbox-1",
      status: "pending_sync",
      idempotent: false,
    });
  });

  it("throws the RPC error without mutating fiscal tables directly", async () => {
    const error = new Error("Not authorized");
    const rpc = vi.fn().mockResolvedValue({ data: null, error });

    await expect(
      reenqueueEcfDocument({
        client: { database: { rpc } },
        tenantId: "tenant-1",
        ecfDocumentId: "doc-1",
      })
    ).rejects.toThrow("Not authorized");

    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
