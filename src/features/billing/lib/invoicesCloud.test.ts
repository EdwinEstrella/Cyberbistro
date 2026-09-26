import { describe, expect, it } from "vitest";
import {
  INVOICE_LIST_WINDOW_MS,
  fetchCloudInvoicesInRange,
  invoiceLoadStartIso,
  localDayBoundsToIso,
  pickRecentCycles,
} from "./invoicesCloud";

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
const cycle = (opened_at: string, created_at?: string) => ({ opened_at, created_at });

describe("pickRecentCycles", () => {
  it("keeps the 5 most recently opened cycles, newest first", () => {
    const cycles = Array.from({ length: 8 }, (_, i) => cycle(`2026-09-${String(10 + i).padStart(2, "0")}T08:00:00Z`));
    const picked = pickRecentCycles(cycles);
    expect(picked).toHaveLength(5);
    expect(picked[0].opened_at).toBe("2026-09-17T08:00:00Z");
    expect(picked[4].opened_at).toBe("2026-09-13T08:00:00Z");
  });
});

describe("invoiceLoadStartIso", () => {
  const now = new Date("2026-09-26T18:00:00Z");

  it("reaches back to the start of the oldest loaded cycle", () => {
    const start = invoiceLoadStartIso([cycle("2026-09-25T08:00:00Z"), cycle("2026-09-22T08:00:00Z", "2026-09-22T07:30:00Z")], now);
    expect(start).toBe("2026-09-22T07:30:00.000Z");
  });

  it("covers at least the last 24h even with no or recent cycles", () => {
    const last24h = new Date(now.getTime() - INVOICE_LIST_WINDOW_MS).toISOString();
    expect(invoiceLoadStartIso([], now)).toBe(last24h);
    expect(invoiceLoadStartIso([cycle("2026-09-26T12:00:00Z")], now)).toBe(last24h);
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
  it("pushes the time range and branch filter down to the query", async () => {
    const { client, queries } = makeClient([{ data: rows(3), error: null }]);
    const res = await fetchCloudInvoicesInRange(client, "t-1", {
      sucursalId: "b-1",
      fromIso: "2026-09-22T07:30:00.000Z",
      toIso: "2026-09-26T23:59:59.999Z",
    });

    expect(res).toEqual({ data: rows(3), error: null });
    const methods = queries[0].map((c) => c.method);
    expect(methods).toEqual(expect.arrayContaining(["eq", "or", "gte", "lte", "order", "range"]));
    expect(queries[0].find((c) => c.method === "gte")?.args).toEqual(["created_at", "2026-09-22T07:30:00.000Z"]);
  });

  it("pages through a bounded range until a short page", async () => {
    const { client, queries } = makeClient([
      { data: rows(1000), error: null },
      { data: rows(10), error: null },
    ]);
    const res = await fetchCloudInvoicesInRange(client, "t-1", { fromIso: "2026-01-01T00:00:00.000Z" });
    expect(res.data).toHaveLength(1010);
    expect(queries).toHaveLength(2);
  });

  it("without a start instant reads only the most recent page (never the full history)", async () => {
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
    const res = await fetchCloudInvoicesInRange(client, "t-1", { fromIso: "2026-01-01T00:00:00.000Z" });
    expect(res.error).toBe(timeout);
    expect(res.data).toHaveLength(1000);
  });
});
