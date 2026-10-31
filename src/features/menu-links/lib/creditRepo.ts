import { supabase } from "../../../shared/lib/supabase";

/**
 * Fetches the credit used by a specific company customer using the database helper.
 */
export async function fetchCompanyCreditUsed(
  tenantId: string,
  customerId: string
): Promise<number> {
  if (!tenantId || !customerId) return 0;
  try {
    const { data, error } = await supabase.rpc("company_credit_used", {
      p_tenant: tenantId,
      p_customer: customerId,
    });
    if (error) return 0;
    return Number(data || 0);
  } catch {
    return 0;
  }
}

/**
 * Fetches credit used for a batch of customers.
 */
export async function fetchBatchCompanyCreditUsed(
  tenantId: string,
  customerIds: string[]
): Promise<Record<string, number>> {
  const uniqueIds = Array.from(new Set(customerIds.filter(Boolean)));
  if (uniqueIds.length === 0 || !tenantId) return {};

  const results: Record<string, number> = {};
  await Promise.all(
    uniqueIds.map(async (cid) => {
      const used = await fetchCompanyCreditUsed(tenantId, cid);
      results[cid] = used;
    })
  );

  return results;
}
