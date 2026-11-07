import { describe, expect, it } from "vitest";
import { buildEcfDocumentPayloadForServer, buildFiscalOutboxPayloadForServer } from "./fiscalSyncPayload";

describe("fiscalSyncPayload", () => {
  describe("buildEcfDocumentPayloadForServer", () => {
    it("translates pending_offline status to queued and marks adjusted true", () => {
      const input = { id: "doc-1", status: "pending_offline", factura_id: "f-1" };
      const result = buildEcfDocumentPayloadForServer(input);
      expect(result).toEqual({
        payload: { id: "doc-1", status: "queued", factura_id: "f-1" },
        adjusted: true,
      });
    });

    it("keeps already queued or other status unchanged with adjusted false", () => {
      const input = { id: "doc-1", status: "queued", factura_id: "f-1" };
      const result = buildEcfDocumentPayloadForServer(input);
      expect(result).toEqual({
        payload: input,
        adjusted: false,
      });
    });
  });

  describe("buildFiscalOutboxPayloadForServer", () => {
    it("translates pending_sync status to queued and marks adjusted true", () => {
      const input = { id: "job-1", status: "pending_sync", operation: "submit" };
      const result = buildFiscalOutboxPayloadForServer(input);
      expect(result).toEqual({
        payload: { id: "job-1", status: "queued", operation: "submit" },
        adjusted: true,
      });
    });

    it("keeps other status unchanged with adjusted false", () => {
      const input = { id: "job-1", status: "blocked_configuration", operation: "submit" };
      const result = buildFiscalOutboxPayloadForServer(input);
      expect(result).toEqual({
        payload: input,
        adjusted: false,
      });
    });
  });
});
