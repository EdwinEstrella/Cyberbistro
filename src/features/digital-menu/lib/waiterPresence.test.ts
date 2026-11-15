import { describe, expect, it } from "vitest";
import {
  countOnlineWaiters,
  isWaiterPresenceRole,
  WAITER_PRESENCE_ROLES,
  waiterPresenceChannelName,
} from "./waiterPresence";

describe("waiterPresence pure lib", () => {
  describe("waiterPresenceChannelName", () => {
    it("formats the channel name with waiters prefix and trimmed tenantId", () => {
      expect(waiterPresenceChannelName("tenant-123")).toBe("waiters:tenant-123");
      expect(waiterPresenceChannelName("  tenant-abc  ")).toBe("waiters:tenant-abc");
    });
  });

  describe("WAITER_PRESENCE_ROLES & isWaiterPresenceRole", () => {
    it("defines the expected staff roles", () => {
      expect(WAITER_PRESENCE_ROLES).toEqual(["mesero", "cajera", "admin"]);
    });

    it("recognizes exact waiter roles", () => {
      expect(isWaiterPresenceRole("mesero")).toBe(true);
      expect(isWaiterPresenceRole("cajera")).toBe(true);
      expect(isWaiterPresenceRole("admin")).toBe(true);
    });

    it("recognizes legacy role aliases via normalizeTenantRol", () => {
      expect(isWaiterPresenceRole("mesera")).toBe(true);
      expect(isWaiterPresenceRole("cajero")).toBe(true);
      expect(isWaiterPresenceRole("ventas")).toBe(true);
      expect(isWaiterPresenceRole("vendedor")).toBe(true);
      expect(isWaiterPresenceRole("vender")).toBe(true);
    });

    it("rejects non-waiter roles and non-strings", () => {
      expect(isWaiterPresenceRole("cocina")).toBe(false);
      expect(isWaiterPresenceRole("cocinero")).toBe(false);
      expect(isWaiterPresenceRole("contabilidad")).toBe(false);
      expect(isWaiterPresenceRole("super_admin")).toBe(false);
      expect(isWaiterPresenceRole("cliente")).toBe(false);
      expect(isWaiterPresenceRole(null)).toBe(false);
      expect(isWaiterPresenceRole(undefined)).toBe(false);
      expect(isWaiterPresenceRole("")).toBe(false);
    });
  });

  describe("countOnlineWaiters", () => {
    it("returns 0 for empty, null, or undefined presenceState", () => {
      expect(countOnlineWaiters(null)).toBe(0);
      expect(countOnlineWaiters(undefined)).toBe(0);
      expect(countOnlineWaiters({})).toBe(0);
    });

    it("counts single and multiple waiter presence entries", () => {
      const state = {
        "client-tab-1": [{ role: "mesero", at: 1000 }],
        "client-tab-2": [{ role: "cajera", at: 1001 }],
        "client-tab-3": [{ role: "admin", at: 1002 }],
      };

      expect(countOnlineWaiters(state)).toBe(3);
    });

    it("counts multiple presences under the same key", () => {
      const state = {
        "client-tab-1": [
          { role: "mesero", at: 1000 },
          { role: "admin", at: 1005 },
        ],
      };

      expect(countOnlineWaiters(state)).toBe(2);
    });

    it("ignores non-waiter staff roles", () => {
      const state = {
        "client-tab-1": [{ role: "cocina", at: 1000 }],
        "client-tab-2": [{ role: "contabilidad", at: 1001 }],
      };

      expect(countOnlineWaiters(state)).toBe(0);
    });

    it("defensively ignores malformed entries and invalid types", () => {
      const state = {
        "bad-bucket-1": "not an array" as unknown as unknown[],
        "bad-bucket-2": [null, undefined, 123, "string", {}, { role: 999 }, { role: "" }],
        "good-bucket": [{ role: "mesero", at: 1000 }],
      };

      expect(countOnlineWaiters(state)).toBe(1);
    });
  });
});
