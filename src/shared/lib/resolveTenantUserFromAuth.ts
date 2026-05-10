import type { UserSchema } from '@insforge/sdk';
import { insforgeClient } from './insforge';
import type { TenantSessionRow } from './tenantSessionCache';

type TenantUserAccessRow = TenantSessionRow & { activo: boolean | null };
type TenantActiveRow = { activa: boolean | null };

export type TenantAccessResolution =
  | { status: 'active'; row: TenantSessionRow }
  | { status: 'blocked' }
  | { status: 'unlinked' };

export const BLOCKED_ACCOUNT_MESSAGE =
  'Tu cuenta está bloqueada. Contactá al administrador del sistema para recuperar el acceso.';
export const UNLINKED_ACCOUNT_MESSAGE =
  'Esta cuenta no está vinculada a ningún negocio. El administrador debe darte acceso desde Soporte.';
import {
  isSuperAdminEmail,
  SUPER_ADMIN_ROLE,
  SUPER_ADMIN_TENANT_ID,
} from './superAdmin';

async function fetchTenantUserByAuthId(authUserId: string) {
  return insforgeClient.database
    .from('tenant_users')
    .select('tenant_id, email, rol, nombre')
    .eq('auth_user_id', authUserId)
    .eq('activo', true)
    .maybeSingle();
}

/** Misma fila que crea Soporte con signUp + insert: email del usuario InsForge Auth. */
async function fetchTenantUserBySessionEmail(email: string) {
  const normalized = email.trim();
  if (!normalized) {
    return { data: null as TenantSessionRow | null, error: null as null };
  }
  return insforgeClient.database
    .from('tenant_users')
    .select('tenant_id, email, rol, nombre')
    .ilike('email', normalized)
    .eq('activo', true)
    .maybeSingle();
}

async function fetchAnyTenantUserByAuthId(authUserId: string) {
  return insforgeClient.database
    .from('tenant_users')
    .select('tenant_id, email, rol, nombre, activo')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
}

async function fetchAnyTenantUserBySessionEmail(email: string) {
  const normalized = email.trim();
  if (!normalized) {
    return { data: null as TenantUserAccessRow | null, error: null as null };
  }
  return insforgeClient.database
    .from('tenant_users')
    .select('tenant_id, email, rol, nombre, activo')
    .ilike('email', normalized)
    .maybeSingle();
}

async function fetchTenantActiveState(tenantId: string) {
  return insforgeClient.database
    .from('tenants')
    .select('activa')
    .eq('id', tenantId)
    .maybeSingle();
}

async function fetchTenantUserByRpc() {
  return insforgeClient.database
    .rpc('cloudix_resolve_tenant_user')
    .then(({ data, error }) => ({
      data: Array.isArray(data) ? (data[0] ?? null) : data,
      error,
    }));
}

async function withRetry<T>(
  label: string,
  fetcher: () => Promise<{ data: T | null; error: unknown }>
): Promise<{ data: T | null; error: unknown }> {
  const maxAttempts = 4;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 350 * attempt));
    }
    const { data, error } = await fetcher();
    if (!error && data) {
      return { data, error: null };
    }
    if (!error && !data) {
      return { data: null, error: null };
    }
    lastError = error;
  }
  console.warn(`resolveTenantUser: ${label} no respondió tras reintentos`, lastError);
  return { data: null, error: lastError };
}

/**
 * Resuelve la fila `tenant_users` para la sesión InsForge actual (dueño o personal creado en Soporte).
 * Primero por `auth_user_id`, luego por email de la sesión.
 */
export async function resolveTenantAccessForSession(user: UserSchema): Promise<TenantAccessResolution> {
  if (isSuperAdminEmail(user.email)) {
    return {
      status: 'active',
      row: {
        tenant_id: SUPER_ADMIN_TENANT_ID,
        email: user.email ?? "",
        rol: SUPER_ADMIN_ROLE,
        nombre:
          typeof user.profile?.name === "string" && user.profile.name.trim()
            ? user.profile.name
            : "Super Admin",
      },
    };
  }

  const { data: byAuth } = await withRetry('tenant_users activo por auth_user_id', () =>
    fetchTenantUserByAuthId(user.id)
  );
  if (byAuth) return { status: 'active', row: byAuth as TenantSessionRow };

  const email = user.email;
  if (email) {
    const { data: byEmail } = await withRetry('tenant_users activo por email', () =>
      fetchTenantUserBySessionEmail(email)
    );
    if (byEmail) return { status: 'active', row: byEmail as TenantSessionRow };
  }

  const { data: byRpc } = await withRetry('tenant_users activo por rpc', fetchTenantUserByRpc);
  if (byRpc) return { status: 'active', row: byRpc as TenantSessionRow };

  const { data: anyByAuth } = await withRetry('tenant_users cualquier estado por auth_user_id', () =>
    fetchAnyTenantUserByAuthId(user.id)
  );
  const inactiveRow = (anyByAuth || (email
    ? (await withRetry('tenant_users cualquier estado por email', () => fetchAnyTenantUserBySessionEmail(email))).data
    : null)) as TenantUserAccessRow | null;

  if (!inactiveRow) return { status: 'unlinked' };
  if (inactiveRow.activo === false) return { status: 'blocked' };

  const { data: tenantState } = await withRetry('tenants estado activo', () =>
    fetchTenantActiveState(inactiveRow.tenant_id)
  );
  if ((tenantState as TenantActiveRow | null)?.activa === false) return { status: 'blocked' };

  return { status: 'unlinked' };
}

export async function resolveTenantUserForSession(user: UserSchema): Promise<TenantSessionRow | null> {
  const resolution = await resolveTenantAccessForSession(user);
  return resolution.status === 'active' ? resolution.row : null;
}
