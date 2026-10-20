import { describe, expect, it, vi } from "vitest";
import { certificationStepEvidence, loadReceivedEvidence, summarizeReceivedEvidence, type ReceivedEvidenceClient } from "./ecfReceivedEvidence";

describe("summarizeReceivedEvidence", () => {
  it("counts documents and approvals by estado", () => {
    const summary = summarizeReceivedEvidence([{ estado: 0 }, { estado: 0 }, { estado: 1 }], [{ estado: 1 }, { estado: 2 }, { estado: 2 }]);
    expect(summary).toEqual({ acceptedDocuments: 2, rejectedDocuments: 1, approvedApprovals: 1, rejectedApprovals: 2 });
  });

  it("returns zeros for empty input", () => {
    expect(summarizeReceivedEvidence([], [])).toEqual({ acceptedDocuments: 0, rejectedDocuments: 0, approvedApprovals: 0, rejectedApprovals: 0 });
  });
});

describe("certificationStepEvidence", () => {
  const empty = summarizeReceivedEvidence([], []);
  const withDoc = summarizeReceivedEvidence([{ estado: 0 }], []);
  const onlyRejectedDoc = summarizeReceivedEvidence([{ estado: 1 }], []);
  const withApproval = summarizeReceivedEvidence([], [{ estado: 1 }]);

  it("requires an accepted e-CF on steps 8 and 9", () => {
    for (const step of [8, 9]) {
      expect(certificationStepEvidence(step, empty)).toEqual({ applies: true, satisfied: false });
      expect(certificationStepEvidence(step, onlyRejectedDoc)).toEqual({ applies: true, satisfied: false });
      expect(certificationStepEvidence(step, withDoc)).toEqual({ applies: true, satisfied: true });
    }
  });

  it("requires an approval on steps 10 and 11", () => {
    for (const step of [10, 11]) {
      expect(certificationStepEvidence(step, withDoc)).toEqual({ applies: true, satisfied: false });
      expect(certificationStepEvidence(step, withApproval)).toEqual({ applies: true, satisfied: true });
    }
  });

  it("does not apply to other steps", () => {
    expect(certificationStepEvidence(7, empty).applies).toBe(false);
    expect(certificationStepEvidence(12, empty).applies).toBe(false);
  });
});

type QueryResult = { data: unknown[] | null; error: { message?: string } | null };

function mockClient(results: Record<string, QueryResult | Error>) {
  const calls: Array<{ table: string; columns: string; tenant: string; order: string; limit: number }> = [];
  const client: ReceivedEvidenceClient = {
    from(table) {
      return {
        select(columns) {
          return {
            eq(_column, tenant) {
              return {
                order(order) {
                  return {
                    limit: vi.fn(async (limit: number) => {
                      calls.push({ table, columns, tenant, order, limit });
                      const result = results[table];
                      if (result instanceof Error) throw result;
                      return result;
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe("loadReceivedEvidence", () => {
  it("queries both tables for the tenant, newest first", async () => {
    const { client, calls } = mockClient({
      ecf_received_documents: { data: [{ id: "d1", estado: 0 }], error: null },
      ecf_received_approvals: { data: [{ id: "a1", estado: 1 }], error: null },
    });
    const result = await loadReceivedEvidence(client, "t1");
    expect(result.error).toBeNull();
    expect(result.docs).toHaveLength(1);
    expect(result.approvals).toHaveLength(1);
    expect(calls.map((call) => call.table).sort()).toEqual(["ecf_received_approvals", "ecf_received_documents"]);
    expect(calls.every((call) => call.tenant === "t1" && call.order === "received_at" && call.limit === 50)).toBe(true);
    expect(calls.find((call) => call.table === "ecf_received_documents")?.columns).toContain("motivo_no_recibido");
  });

  it("reports query errors without throwing", async () => {
    const { client } = mockClient({
      ecf_received_documents: { data: null, error: { message: "boom" } },
      ecf_received_approvals: { data: [], error: null },
    });
    expect(await loadReceivedEvidence(client, "t1")).toEqual({ docs: [], approvals: [], error: "boom" });
  });

  it("converts thrown errors into an error result", async () => {
    const { client } = mockClient({ ecf_received_documents: new Error("offline"), ecf_received_approvals: { data: [], error: null } });
    expect((await loadReceivedEvidence(client, "t1")).error).toBe("offline");
  });
});
