import { describe, expect, it } from "vitest";
import { defaultInvoiceDateFrom, fetchCloudInvoicesInRange, localDayBoundsToIso } from "./invoicesCloud";

type Call = { method: string; args: unknown[] };

/** Chainable PostgREST stub: records every call and serves `pages` in order. */
function makeClient(pages: Array<{ data: unknown[] | null; error: unknown }>) {
  const queries: Call[][] = [];
  let served = 0;
  const client = {
    from(table: string) {
      const calls: Call[] = [{ method: "from", args: [table] }];
      queries.push(calls);
      const builder: any = new Proxy(
        {},
        {
          get(_target, prop: string) {
            if (prop === "then") {
              const result = pages[served++] ?? { data: [], error: null };
              return (resolve: (v: unknown) => void) => resolve(result);
            }
            return (...args: unknown[]) => {
              calls.push({ method: prop, args });
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
  return { client: client as any, queries };
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f-${i}` }));

describe("defaultInvoiceDateFrom", () => {
  it("returns the local day six days before today (7-day window including today)", () => {
    expect(defaultInvoiceDateFrom(new Date(2026, 8, 26, 15, 30))).toBe("2026-09-20");
  });

  it("crosses month boundaries", () => {
    expect(defaultInvoiceDateFrom(new Date(2026, 9, 3))).toBe("2026-09-27");
  });
});

describe("localDayBoundsToIso", () => {
  it("expands local days to start/end instants", () => {
    const { fromIso, toIso } = localDayBoundsToIso("2026-09-20", "2026-09-26");
    expect(fromIso).toBe(new Date(2026, 8, 20, 0, 0, 0).toISOString());
    expect(toIso).toBe(new Date(2026, 8, 26, 23, 59, 59, 999).toISOString());
  });

  it("leaves missing bounds undefined", () => {
    expect(localDayBoundsToIso("", "")).toEqual({ fromIso: undefined, toIso: undefined });
  });
});

describe("fetchCloudInvoicesInRange", () => {
  it("pushes the date range and branch filter down to the query", async () => {
    const { client, queries } = makeClient([{ data: rows(3), error: null }]);
    const res = await fetchCloudInvoicesInRange(client, "t-1", { sucursalId: "b-1", dateFrom: "2026-09-20", dateTo: "2026-09-26" });

    expect(res).toEqual({ data: rows(3), error: null });
    const methods = queries[0].map((c) => c.method);
    expect(methods).toEqual(expect.arrayContaining(["eq", "or", "gte", "lte", "order", "range"]));
    expect(queries[0].find((c) => c.method === "gte")?.args).toEqual(["created_at", localDayBoundsToIso("2026-09-20").fromIso]);
  });

  it("pages through a bounded range until a short page", async () => {
    const { client, queries } = makeClient([
      { data: rows(1000), error: null },
      { data: rows(10), error: null },
    ]);
    const res = await fetchCloudInvoicesInRange(client, "t-1", { dateFrom: "2026-01-01" });
    expect(res.data).toHaveLength(1010);
    expect(queries).toHaveLength(2);
  });

  it("without a start date reads only the most recent page (never the full history)", async () => {
    const { client, queries } = makeClient([
      { data: rows(1000), error: null },
      { data: rows(1000), error: null },
    ]);
    const res = await fetchCloudInvoicesInRange(client, "t-1", {});
    expect(res.data).toHaveLength(1000);
    expect(queries).toHaveLength(1);
    expect(queries[0].some((c) => c.method === "gte")).toBe(false);
  });

  it("surfaces the error with the rows loaded so far", async () => {
    const timeout = { code: "57014", message: "canceling statement due to statement timeout" };
    const { client } = makeClient([
      { data: rows(1000), error: null },
      { data: null, error: timeout },
    ]);
    const res = await fetchCloudInvoicesInRange(client, "t-1", { dateFrom: "2026-01-01" });
    expect(res.error).toBe(timeout);
    expect(res.data).toHaveLength(1000);
  });
});
