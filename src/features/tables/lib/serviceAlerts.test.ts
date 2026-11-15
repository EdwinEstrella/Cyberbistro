import { describe, expect, it } from "vitest";
import {
  applyServiceRequestEvent,
  describeServiceAlert,
  formatWaitTime,
  parseServiceAlertRow,
  shouldPlayAlertSound,
  shouldRemoveAfterAttend,
  sortServiceAlerts,
  type ServiceAlert,
} from "./serviceAlerts";

describe("serviceAlerts", () => {
  describe("parseServiceAlertRow", () => {
    it("parses valid pending row with snake_case fields", () => {
      const row = {
        id: "req-1",
        tenant_id: "tenant-1",
        sucursal_id: "suc-1",
        mesa_numero: 5,
        kind: "waiter",
        status: "pending",
        created_at: "2026-11-12T15:00:00.000Z",
      };

      const result = parseServiceAlertRow(row);
      expect(result).toEqual({
        id: "req-1",
        mesaNumero: 5,
        kind: "waiter",
        createdAt: "2026-11-12T15:00:00.000Z",
        sucursalId: "suc-1",
      });
    });

    it("parses valid pending row with camelCase fields and null sucursalId", () => {
      const row = {
        id: "req-2",
        mesaNumero: 12,
        kind: "bill",
        status: "pending",
        createdAt: "2026-11-12T15:05:00.000Z",
        sucursalId: null,
      };

      const result = parseServiceAlertRow(row);
      expect(result).toEqual({
        id: "req-2",
        mesaNumero: 12,
        kind: "bill",
        createdAt: "2026-11-12T15:05:00.000Z",
        sucursalId: null,
      });
    });

    it("parses string mesa_numero if numeric", () => {
      const row = {
        id: "req-3",
        mesa_numero: "8",
        kind: "waiter",
        status: "pending",
        created_at: "2026-11-12T15:00:00.000Z",
      };

      const result = parseServiceAlertRow(row);
      expect(result?.mesaNumero).toBe(8);
    });

    it("returns null for rows with status not equal to 'pending'", () => {
      expect(
        parseServiceAlertRow({
          id: "req-1",
          mesa_numero: 1,
          kind: "waiter",
          status: "attended",
          created_at: "2026-11-12T15:00:00.000Z",
        })
      ).toBeNull();

      expect(
        parseServiceAlertRow({
          id: "req-1",
          mesa_numero: 1,
          kind: "waiter",
          status: "cancelled",
          created_at: "2026-11-12T15:00:00.000Z",
        })
      ).toBeNull();
    });

    it("returns null for non-object, null, or array inputs", () => {
      expect(parseServiceAlertRow(null)).toBeNull();
      expect(parseServiceAlertRow(undefined)).toBeNull();
      expect(parseServiceAlertRow("invalid")).toBeNull();
      expect(parseServiceAlertRow(123)).toBeNull();
      expect(parseServiceAlertRow([])).toBeNull();
    });

    it("returns null when id is missing or empty", () => {
      expect(
        parseServiceAlertRow({
          id: "",
          mesa_numero: 1,
          kind: "waiter",
          status: "pending",
          created_at: "2026-11-12T15:00:00.000Z",
        })
      ).toBeNull();
    });

    it("returns null when mesa_numero is non-positive or non-integer or NaN", () => {
      expect(
        parseServiceAlertRow({
          id: "req-1",
          mesa_numero: 0,
          kind: "waiter",
          status: "pending",
          created_at: "2026-11-12T15:00:00.000Z",
        })
      ).toBeNull();

      expect(
        parseServiceAlertRow({
          id: "req-1",
          mesa_numero: -2,
          kind: "waiter",
          status: "pending",
          created_at: "2026-11-12T15:00:00.000Z",
        })
      ).toBeNull();

      expect(
        parseServiceAlertRow({
          id: "req-1",
          mesa_numero: 2.5,
          kind: "waiter",
          status: "pending",
          created_at: "2026-11-12T15:00:00.000Z",
        })
      ).toBeNull();

      expect(
        parseServiceAlertRow({
          id: "req-1",
          mesa_numero: "foo",
          kind: "waiter",
          status: "pending",
          created_at: "2026-11-12T15:00:00.000Z",
        })
      ).toBeNull();
    });

    it("returns null when kind is unrecognized", () => {
      expect(
        parseServiceAlertRow({
          id: "req-1",
          mesa_numero: 1,
          kind: "kitchen",
          status: "pending",
          created_at: "2026-11-12T15:00:00.000Z",
        })
      ).toBeNull();
    });

    it("returns null when created_at is missing or an invalid date", () => {
      expect(
        parseServiceAlertRow({
          id: "req-1",
          mesa_numero: 1,
          kind: "waiter",
          status: "pending",
          created_at: "not-a-date",
        })
      ).toBeNull();
    });
  });

  describe("sortServiceAlerts", () => {
    it("sorts alerts oldest first", () => {
      const a1: ServiceAlert = {
        id: "a1",
        mesaNumero: 2,
        kind: "waiter",
        createdAt: "2026-11-12T15:00:00.000Z",
        sucursalId: null,
      };
      const a2: ServiceAlert = {
        id: "a2",
        mesaNumero: 1,
        kind: "bill",
        createdAt: "2026-11-12T14:30:00.000Z",
        sucursalId: null,
      };
      const a3: ServiceAlert = {
        id: "a3",
        mesaNumero: 5,
        kind: "waiter",
        createdAt: "2026-11-12T15:10:00.000Z",
        sucursalId: null,
      };

      const sorted = sortServiceAlerts([a1, a2, a3]);
      expect(sorted.map((s) => s.id)).toEqual(["a2", "a1", "a3"]);
    });

    it("uses mesaNumero and id as deterministic tiebreakers", () => {
      const a1: ServiceAlert = {
        id: "b",
        mesaNumero: 2,
        kind: "waiter",
        createdAt: "2026-11-12T15:00:00.000Z",
        sucursalId: null,
      };
      const a2: ServiceAlert = {
        id: "a",
        mesaNumero: 2,
        kind: "waiter",
        createdAt: "2026-11-12T15:00:00.000Z",
        sucursalId: null,
      };
      const a3: ServiceAlert = {
        id: "c",
        mesaNumero: 1,
        kind: "bill",
        createdAt: "2026-11-12T15:00:00.000Z",
        sucursalId: null,
      };

      const sorted = sortServiceAlerts([a1, a2, a3]);
      expect(sorted.map((s) => s.id)).toEqual(["c", "a", "b"]);
    });
  });

  describe("applyServiceRequestEvent", () => {
    const existing1: ServiceAlert = {
      id: "alert-1",
      mesaNumero: 1,
      kind: "waiter",
      createdAt: "2026-11-12T15:00:00.000Z",
      sucursalId: null,
    };
    const existing2: ServiceAlert = {
      id: "alert-2",
      mesaNumero: 2,
      kind: "bill",
      createdAt: "2026-11-12T15:05:00.000Z",
      sucursalId: null,
    };

    it("INSERT of pending row adds without duplicates and sorts oldest first", () => {
      const payload = {
        id: "alert-0",
        mesa_numero: 3,
        kind: "waiter",
        status: "pending",
        created_at: "2026-11-12T14:50:00.000Z",
      };

      const res = applyServiceRequestEvent([existing1, existing2], "INSERT", payload);
      expect(res).toHaveLength(3);
      expect(res[0].id).toBe("alert-0");
      expect(res[1].id).toBe("alert-1");
      expect(res[2].id).toBe("alert-2");
    });

    it("INSERT with existing id replaces the existing alert without duplicating", () => {
      const payload = {
        id: "alert-1",
        mesa_numero: 1,
        kind: "bill",
        status: "pending",
        created_at: "2026-11-12T15:00:00.000Z",
      };

      const res = applyServiceRequestEvent([existing1, existing2], "INSERT", payload);
      expect(res).toHaveLength(2);
      expect(res.find((a) => a.id === "alert-1")?.kind).toBe("bill");
    });

    it("UPDATE of pending row updates and re-sorts", () => {
      const payload = {
        id: "alert-1",
        mesa_numero: 9,
        kind: "bill",
        status: "pending",
        created_at: "2026-11-12T15:20:00.000Z",
      };

      const res = applyServiceRequestEvent([existing1, existing2], "UPDATE", payload);
      expect(res).toHaveLength(2);
      expect(res[0].id).toBe("alert-2");
      expect(res[1].id).toBe("alert-1");
      expect(res[1].mesaNumero).toBe(9);
    });

    it("UPDATE with status 'attended' removes by id", () => {
      const payload = {
        id: "alert-1",
        status: "attended",
        attended_at: "2026-11-12T15:06:00.000Z",
      };

      const res = applyServiceRequestEvent([existing1, existing2], "UPDATE", payload);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe("alert-2");
    });

    it("INSERT with status 'attended' removes by id", () => {
      const payload = {
        id: "alert-2",
        status: "attended",
      };

      const res = applyServiceRequestEvent([existing1, existing2], "INSERT", payload);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe("alert-1");
    });

    it("DELETE removes by id", () => {
      const payload = {
        id: "alert-1",
        tenant_id: "tenant-1",
      };

      const res = applyServiceRequestEvent([existing1, existing2], "DELETE", payload);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe("alert-2");
    });

    it("DELETE of non-existent id returns current array", () => {
      const payload = { id: "unknown-id" };
      const res = applyServiceRequestEvent([existing1, existing2], "DELETE", payload);
      expect(res).toEqual([existing1, existing2]);
    });

    it("malformed payload returns current array unchanged", () => {
      expect(applyServiceRequestEvent([existing1], "INSERT", null)).toEqual([existing1]);
      expect(applyServiceRequestEvent([existing1], "INSERT", undefined)).toEqual([existing1]);
      expect(applyServiceRequestEvent([existing1], "INSERT", {})).toEqual([existing1]);
      expect(
        applyServiceRequestEvent([existing1], "INSERT", { id: "bad", status: "pending" })
      ).toEqual([existing1]);
      expect(applyServiceRequestEvent([existing1], "DELETE", "invalid")).toEqual([existing1]);
    });
  });

  describe("shouldPlayAlertSound", () => {
    const existing: ServiceAlert = {
      id: "alert-1",
      mesaNumero: 1,
      kind: "waiter",
      createdAt: "2026-11-12T15:00:00.000Z",
      sucursalId: null,
    };

    it("returns true only for an INSERT of a pending row not currently in alerts", () => {
      const payload = {
        id: "alert-new",
        mesa_numero: 3,
        kind: "waiter",
        status: "pending",
        created_at: "2026-11-12T15:05:00.000Z",
      };

      expect(shouldPlayAlertSound("INSERT", payload, [existing])).toBe(true);
    });

    it("returns false for an INSERT of a row whose id is already in current (replay/duplicate)", () => {
      const payload = {
        id: "alert-1",
        mesa_numero: 1,
        kind: "waiter",
        status: "pending",
        created_at: "2026-11-12T15:00:00.000Z",
      };

      expect(shouldPlayAlertSound("INSERT", payload, [existing])).toBe(false);
    });

    it("returns false for an INSERT with status 'attended'", () => {
      const payload = {
        id: "alert-new",
        mesa_numero: 3,
        kind: "waiter",
        status: "attended",
        created_at: "2026-11-12T15:05:00.000Z",
      };

      expect(shouldPlayAlertSound("INSERT", payload, [existing])).toBe(false);
    });

    it("returns false for UPDATE events", () => {
      const payload = {
        id: "alert-new",
        mesa_numero: 3,
        kind: "waiter",
        status: "pending",
        created_at: "2026-11-12T15:05:00.000Z",
      };

      expect(shouldPlayAlertSound("UPDATE", payload, [existing])).toBe(false);
    });

    it("returns false for DELETE events", () => {
      const payload = { id: "alert-1" };
      expect(shouldPlayAlertSound("DELETE", payload, [existing])).toBe(false);
    });

    it("returns false for malformed payload", () => {
      expect(shouldPlayAlertSound("INSERT", null, [existing])).toBe(false);
      expect(shouldPlayAlertSound("INSERT", {}, [existing])).toBe(false);
      expect(
        shouldPlayAlertSound("INSERT", { id: "req", status: "pending" }, [existing])
      ).toBe(false);
    });
  });

  describe("shouldRemoveAfterAttend", () => {
    it("returns true when updatedRows contains at least one row", () => {
      expect(shouldRemoveAfterAttend([{ id: "req-1" }])).toBe(true);
      expect(shouldRemoveAfterAttend([{ id: "req-1" }, { id: "req-2" }])).toBe(true);
    });

    it("returns false when updatedRows is an empty array", () => {
      expect(shouldRemoveAfterAttend([])).toBe(false);
    });

    it("returns false for null, undefined, or non-array values", () => {
      expect(shouldRemoveAfterAttend(null)).toBe(false);
      expect(shouldRemoveAfterAttend(undefined)).toBe(false);
      expect(shouldRemoveAfterAttend({})).toBe(false);
      expect(shouldRemoveAfterAttend("req-1")).toBe(false);
      expect(shouldRemoveAfterAttend(123)).toBe(false);
      expect(shouldRemoveAfterAttend(true)).toBe(false);
    });
  });

  describe("describeServiceAlert", () => {
    it("describes waiter alert in Spanish", () => {
      const alert: ServiceAlert = {
        id: "req-1",
        mesaNumero: 5,
        kind: "waiter",
        createdAt: "2026-11-12T15:00:00.000Z",
        sucursalId: null,
      };

      expect(describeServiceAlert(alert)).toEqual({
        title: "Mesa 5",
        subtitle: "Llama al mesero",
      });
    });

    it("describes bill alert in Spanish", () => {
      const alert: ServiceAlert = {
        id: "req-2",
        mesaNumero: 12,
        kind: "bill",
        createdAt: "2026-11-12T15:00:00.000Z",
        sucursalId: null,
      };

      expect(describeServiceAlert(alert)).toEqual({
        title: "Mesa 12",
        subtitle: "Pide la cuenta",
      });
    });
  });

  describe("formatWaitTime", () => {
    const base = new Date("2026-11-12T15:00:00.000Z");

    it("returns 'hace un momento' for < 1 min", () => {
      const createdNow = new Date("2026-11-12T15:00:00.000Z").toISOString();
      expect(formatWaitTime(createdNow, base)).toBe("hace un momento");

      const created30s = new Date("2026-11-12T14:59:30.000Z").toISOString();
      expect(formatWaitTime(created30s, base)).toBe("hace un momento");

      const created59s = new Date("2026-11-12T14:59:01.000Z").toISOString();
      expect(formatWaitTime(created59s, base)).toBe("hace un momento");
    });

    it("returns 'hace N min' for minutes < 60", () => {
      const created1m = new Date("2026-11-12T14:59:00.000Z").toISOString();
      expect(formatWaitTime(created1m, base)).toBe("hace 1 min");

      const created3m = new Date("2026-11-12T14:57:00.000Z").toISOString();
      expect(formatWaitTime(created3m, base)).toBe("hace 3 min");

      const created59m = new Date("2026-11-12T14:01:00.000Z").toISOString();
      expect(formatWaitTime(created59m, base)).toBe("hace 59 min");
    });

    it("returns 'hace H h' for exact hours", () => {
      const created1h = new Date("2026-11-12T14:00:00.000Z").toISOString();
      expect(formatWaitTime(created1h, base)).toBe("hace 1 h");

      const created2h = new Date("2026-11-12T13:00:00.000Z").toISOString();
      expect(formatWaitTime(created2h, base)).toBe("hace 2 h");
    });

    it("returns 'hace H h M min' when remainder minutes exist", () => {
      const created1h5m = new Date("2026-11-12T13:55:00.000Z").toISOString();
      expect(formatWaitTime(created1h5m, base)).toBe("hace 1 h 5 min");

      const created2h15m = new Date("2026-11-12T12:45:00.000Z").toISOString();
      expect(formatWaitTime(created2h15m, base)).toBe("hace 2 h 15 min");
    });

    it("returns empty string for invalid date inputs", () => {
      expect(formatWaitTime("", base)).toBe("");
      expect(formatWaitTime("invalid", base)).toBe("");
      expect(formatWaitTime(null as any, base)).toBe("");
      expect(formatWaitTime(new Date().toISOString(), new Date("invalid"))).toBe("");
    });

    it("handles future dates (clock skew) gracefully as 'hace un momento'", () => {
      const future = new Date("2026-11-12T15:05:00.000Z").toISOString();
      expect(formatWaitTime(future, base)).toBe("hace un momento");
    });
  });
});
