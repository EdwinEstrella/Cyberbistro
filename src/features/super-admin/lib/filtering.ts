import type { TenantCard, TenantFilterState } from "./types";

export function filterTenants(cards: TenantCard[], filter: TenantFilterState): TenantCard[] {
  const searchTerm = filter.search.trim().toLowerCase();
  const searchDigits = searchTerm.replace(/\D/g, "");

  return cards.filter((card) => {
    // 1. Status Filter
    if (filter.status === "active" && card.tenant.activa === false) {
      return false;
    }
    if (filter.status === "blocked" && card.tenant.activa !== false) {
      return false;
    }

    // 2. Plan Filter
    if (filter.plan !== "all") {
      const planKey = (card.tenant.plan?.toLowerCase() ?? "basico");
      if (planKey !== filter.plan) {
        return false;
      }
    }

    // 3. Search Query
    if (searchTerm) {
      const name = (card.tenant.nombre_negocio || "").toLowerCase();
      const rawRnc = (card.tenant.rnc || "").toLowerCase();
      const rncDigits = rawRnc.replace(/\D/g, "");
      const tenantId = (card.tenant.id || "").toLowerCase();

      const nameMatch = name.includes(searchTerm);
      const rncMatch = rawRnc.includes(searchTerm) || (searchDigits && rncDigits.includes(searchDigits));
      const idMatch = tenantId.includes(searchTerm);
      const emailMatch = card.users.some((user) => user.email.toLowerCase().includes(searchTerm));

      if (!nameMatch && !rncMatch && !idMatch && !emailMatch) {
        return false;
      }
    }

    return true;
  });
}
