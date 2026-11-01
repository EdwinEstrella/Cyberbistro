import { describe, expect, it } from "vitest";
import { filterTenants } from "../filtering";
import type { TenantCard } from "../types";

describe("filterTenants", () => {
  const cards: TenantCard[] = [
    {
      tenant: { id: "t1", nombre_negocio: "Salpimentao Gourmet", rnc: "131234567", activa: true, plan: "profesional" },
      users: [{ id: "u1", tenant_id: "t1", email: "owner@salpimentao.com", rol: "admin", nombre: "Juan", activo: true, auth_user_id: "a1" }],
      admins: [],
      counts: { admin: 1, cajera: 0, cocina: 0, mesero: 0 },
    },
    {
      tenant: { id: "t2", nombre_negocio: "Parrillada Express", rnc: "101001234", activa: false, plan: "basico" },
      users: [{ id: "u2", tenant_id: "t2", email: "pedro@parrillada.com", rol: "admin", nombre: "Pedro", activo: true, auth_user_id: "a2" }],
      admins: [],
      counts: { admin: 1, cajera: 0, cocina: 0, mesero: 0 },
    },
    {
      tenant: { id: "t3", nombre_negocio: "Corporación Gastronómica", rnc: "133999888", activa: true, plan: "corporativo" },
      users: [{ id: "u3", tenant_id: "t3", email: "finanzas@corpgastro.do", rol: "admin", nombre: "Ana", activo: true, auth_user_id: "a3" }],
      admins: [],
      counts: { admin: 1, cajera: 0, cocina: 0, mesero: 0 },
    },
  ];

  it("filters by search term in restaurant name", () => {
    const res = filterTenants(cards, { search: "salpimentao", status: "all", plan: "all" });
    expect(res).toHaveLength(1);
    expect(res[0].tenant.id).toBe("t1");
  });

  it("filters by search term in RNC digits", () => {
    const res = filterTenants(cards, { search: "10100", status: "all", plan: "all" });
    expect(res).toHaveLength(1);
    expect(res[0].tenant.id).toBe("t2");
  });

  it("filters by search term in user email", () => {
    const res = filterTenants(cards, { search: "corpgastro", status: "all", plan: "all" });
    expect(res).toHaveLength(1);
    expect(res[0].tenant.id).toBe("t3");
  });

  it("filters by status (active vs blocked)", () => {
    const active = filterTenants(cards, { search: "", status: "active", plan: "all" });
    expect(active.map((c) => c.tenant.id)).toEqual(["t1", "t3"]);

    const blocked = filterTenants(cards, { search: "", status: "blocked", plan: "all" });
    expect(blocked.map((c) => c.tenant.id)).toEqual(["t2"]);
  });

  it("filters by plan", () => {
    const corp = filterTenants(cards, { search: "", status: "all", plan: "corporativo" });
    expect(corp).toHaveLength(1);
    expect(corp[0].tenant.id).toBe("t3");
  });
});
