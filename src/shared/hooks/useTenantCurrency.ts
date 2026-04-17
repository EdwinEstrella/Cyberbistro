import { useEffect, useMemo, useState } from "react";
import { insforgeClient } from "../lib/insforge";
import {
  formatTenantCurrency,
  normalizeTenantCurrencyCode,
  tenantCurrencySymbol,
  type TenantCurrencyCode,
} from "../lib/currency";
import { useAuth } from "./useAuth";

export function useTenantCurrency() {
  const { tenantId, loading: authLoading } = useAuth();
  const [currencyCode, setCurrencyCode] = useState<TenantCurrencyCode>("DOP");

  useEffect(() => {
    if (authLoading || !tenantId) return;
    let cancelled = false;

    void (async () => {
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

      if (cancelled || res.error || !res.data) return;
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
