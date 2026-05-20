import { useEffect, useMemo, useState } from "react";
import { insforgeClient } from "../lib/insforge";
import {
  formatTenantCurrency,
  normalizeTenantCurrencyCode,
  tenantCurrencySymbol,
  type TenantCurrencyCode,
} from "../lib/currency";
import { readLocalMirror, shouldReadLocalFirst } from "../lib/localFirst";
import { useAuth } from "./useAuth";

export function useTenantCurrency() {
  const { tenantId, loading: authLoading } = useAuth();
  const [currencyCode, setCurrencyCode] = useState<TenantCurrencyCode>("DOP");

  useEffect(() => {
    if (authLoading || !tenantId) return;
    let cancelled = false;

    void (async () => {
      const readLocalCurrency = async () => {
        const tenants = await readLocalMirror<{ id: string; moneda?: string | null; currency_code?: string | null }>(tenantId, "tenants").catch(() => []);
        const tenant = tenants.find((row) => row.id === tenantId);
        return tenant ? normalizeTenantCurrencyCode(tenant.moneda || tenant.currency_code) : null;
      };

      if (await shouldReadLocalFirst(tenantId, ["tenants"]).catch(() => false)) {
        const localCurrency = await readLocalCurrency();
        if (!cancelled && localCurrency) setCurrencyCode(localCurrency);
        return;
      }

      let res = await insforgeClient.database
        .from("tenants")
        .select("moneda")
        .eq("id", tenantId)
        .maybeSingle();

      if (res.error) {
        // Compatibilidad para entornos que usan currency_code
        res = await insforgeClient.database
          .from("tenants")
          .select("currency_code")
          .eq("id", tenantId)
          .maybeSingle();
      }

      if (cancelled) return;
      if (res.error || !res.data) {
        const localCurrency = await readLocalCurrency();
        if (localCurrency) setCurrencyCode(localCurrency);
        return;
      }
      const data = res.data as { moneda?: string | null; currency_code?: string | null };
      setCurrencyCode(normalizeTenantCurrencyCode(data.moneda || data.currency_code));
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, tenantId]);

  return useMemo(
    () => ({
      currencyCode,
      currencySymbol: tenantCurrencySymbol(currencyCode),
      formatMoney: (n: number, opts?: { withSymbol?: boolean }) =>
        formatTenantCurrency(n, currencyCode, opts),
    }),
    [currencyCode]
  );
}
