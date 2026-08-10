export type TenantAccessStatus =
  | "active_memberships"
  | "blocked"
  | "truly_unlinked"
  | "cloud_unavailable"
  | "authorization_error"
  | "cardinality_error";

export type TenantAccessRowsInput =
  | { kind: "cloud_unavailable" }
  | { kind: "authorization_error" }
  | { kind: "memberships"; rows: Array<{ tenant_id: string; activo?: boolean | null }> };

export type TenantMembershipResolution =
  | { status: "active_memberships"; tenantId: string }
  | { status: "blocked"; tenantId: string }
  | { status: "truly_unlinked" }
  | { status: "cloud_unavailable" }
  | { status: "authorization_error" }
  | { status: "cardinality_error" };

export function classifyTenantAccessRows(input: TenantAccessRowsInput): { status: TenantAccessStatus } {
  if (input.kind === "cloud_unavailable") return { status: "cloud_unavailable" };
  if (input.kind === "authorization_error") return { status: "authorization_error" };
  if (input.rows.length === 0) return { status: "truly_unlinked" };
  if (input.rows.length > 1) return { status: "cardinality_error" };
  return input.rows[0].activo === false ? { status: "blocked" } : { status: "active_memberships" };
}

export function classifyTenantMembershipResolution(input: TenantAccessRowsInput): TenantMembershipResolution {
  if (input.kind === "cloud_unavailable") return { status: "cloud_unavailable" };
  if (input.kind === "authorization_error") return { status: "authorization_error" };
  if (input.rows.length === 0) return { status: "truly_unlinked" };
  if (input.rows.length > 1) return { status: "cardinality_error" };

  const [membership] = input.rows;
  if (membership.activo === false) return { status: "blocked", tenantId: membership.tenant_id };
  return { status: "active_memberships", tenantId: membership.tenant_id };
}
