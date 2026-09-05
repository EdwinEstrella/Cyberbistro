import type { UserSchema } from '@insforge/sdk';
import { insforgeClient } from './insforge';
import { isCloudAvailabilityFailure, recordCloudFailure } from './cloudAvailability';
import { readTenantSessionCache, type TenantSessionRow } from './tenantSessionCache';
import { classifyTenantMembershipResolution } from './tenantAccess';

type TenantUserAccessRow = TenantSessionRow & { activo: boolean | null };
type TenantActiveRow = { activa: boolean | null };

export type TenantAccessResolution =
  | { status: 'active'; row: TenantSessionRow }
  | { status: 'blocked'; tenantId?: string }
  | { status: 'truly_unlinked' }
  | { status: 'cloud_unavailable' }
  | { status: 'authorization_error' }
  | { status: 'cardinality_error' };

export const BLOCKED_ACCOUNT_MESSAGE =
  'Tu cuenta está bloqueada. Contactá al administrador del sistema para recuperar el acceso.';
export const UNLINKED_ACCOUNT_MESSAGE =
  'Esta cuenta no está vinculada a ningún negocio. El administrador debe darte acceso desde Soporte.';
import {
  isSuperAdminEmail,
  SUPER_ADMIN_ROLE,
  SUPER_ADMIN_TENANT_ID,
} from './superAdmin';

function cachedTenantAccessForUser(
  user: UserSchema,
  expectedTenantId?: string,
): TenantAccessResolution | null {
  const cached = readTenantSessionCache();
  if (!cached || cached.authUserId !== user.id) return null;
  if (expectedTenantId && cached.tenant_id !== expectedTenantId) return null;

  return {
    status: 'active',
    row: {
      tenant_id: cached.tenant_id,
      email: cached.email,
      rol: cached.rol,
      nombre: cached.nombre,
      plan: cached.plan,
    },
  };
}

function preserveCachedAccessDuringCloudFailure(
  user: UserSchema,
  error: unknown,
  expectedTenantId?: string,
): TenantAccessResolution | null {
  if (!isCloudAvailabilityFailure(error)) return null;
  recordCloudFailure();
  const cached = cachedTenantAccessForUser(user, expectedTenantId);
  if (cached) {
    console.warn(
      'resolveTenantUser: nube no disponible; se conserva la última autorización local validada',
      error,
    );
  }
  return cached;
}

async function fetchTenantUserByAuthId(authUserId: string) {
  return insforgeClient.database
    .from('tenant_users')
    .select('tenant_id, email, rol, nombre, tenants(plan)')
    .eq('auth_user_id', authUserId)
    .eq('activo', true)
    .maybeSingle();
}

/** Misma fila que crea Soporte con signUp + insert: email del usuario InsForge Auth. */
async function fetchTenantUserBySessionEmail(email: string) {
  const normalized = email.trim();
  if (!normalized) {
    return { data: null as any, error: null as null };
  }
  return insforgeClient.database
    .from('tenant_users')
    .select('tenant_id, email, rol, nombre, tenants(plan)')
    .ilike('email', normalized)
    .is('auth_user_id', null)
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
    .is('auth_user_id', null)
    .maybeSingle();
}

async function fetchTenantActiveState(tenantId: string) {
  return insforgeClient.database
    .from('tenants')
    .select('activa')
    .eq('id', tenantId)
    .maybeSingle();
}

async function resolveActiveTenantUserRow(
  rawRow: any,
  user: UserSchema,
): Promise<TenantAccessResolution> {
  const tenantId = rawRow?.tenant_id;
  if (typeof tenantId !== 'string' || !tenantId) return { status: 'truly_unlinked' };
  const { data: tenantState, error: tenantStateError } = await withRetry(
    'tenants estado activo para miembro activo',
    () => fetchTenantActiveState(tenantId),
  );

  if (tenantStateError) {
    const cached = preserveCachedAccessDuringCloudFailure(user, tenantStateError, tenantId);
    if (cached) return cached;

    // La membresía activa ya fue resuelta de forma concluyente. Un fallo aislado
    // consultando el estado del tenant no debe convertirse en un bloqueo falso.
    console.warn(
      'resolveTenantUser: no se pudo revalidar el estado del negocio; se conserva la membresía activa',
      tenantStateError,
    );
    return {
      status: 'active',
      row: {
        tenant_id: tenantId,
        email: rawRow.email,
        rol: rawRow.rol,
        nombre: rawRow.nombre,
        plan: rawRow.tenants?.plan ?? rawRow.plan ?? 'basico',
      },
    };
  }

  if ((tenantState as TenantActiveRow | null)?.activa !== true) {
    return { status: 'blocked', tenantId };
  }
  return {
    status: 'active',
    row: {
      tenant_id: tenantId,
      email: rawRow.email,
      rol: rawRow.rol,
      nombre: rawRow.nombre,
      plan: rawRow.tenants?.plan ?? rawRow.plan ?? 'basico',
    },
  };
}

async function fetchTenantUserByRpc() {
  return insforgeClient.database
    .rpc('cloudix_resolve_tenant_user')
    .then(({ data, error }) => ({
      data: Array.isArray(data) ? (data[0] ?? null) : data,
      error,
    }));
}

async function fetchTenantMembershipsByRpc() {
  return insforgeClient.database
    .rpc('cloudix_resolve_tenant_memberships')
    .then(({ data, error }) => ({
      data: Array.isArray(data) ? data : [],
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

    // DNS, timeout y servidor caído no mejoran repitiendo cinco consultas
    // consecutivas. El circuit breaker se encargará de reintentar después.
    if (isCloudAvailabilityFailure(error)) break;
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
        plan: 'profesional',
      },
    };
  }

  let cloudFailure: unknown = null;
  const rememberCloudFailure = (error: unknown) => {
    if (error && isCloudAvailabilityFailure(error)) cloudFailure = error;
  };

  const { data: memberships, error: membershipsError } = await withRetry(
    'tenant memberships via authoritative RPC',
    fetchTenantMembershipsByRpc,
  );
  rememberCloudFailure(membershipsError);
  if (membershipsError) {
    const cached = preserveCachedAccessDuringCloudFailure(user, membershipsError);
    if (cached) return cached;
    return isCloudAvailabilityFailure(membershipsError)
      ? { status: 'cloud_unavailable' }
      : { status: 'authorization_error' };
  }

  const membershipRows = memberships ?? [];
  const membershipResolution = classifyTenantMembershipResolution({
    kind: 'memberships',
    rows: membershipRows as Array<{ tenant_id: string; activo?: boolean | null }>,
  });
  if (membershipResolution.status === 'active_memberships') {
    const membership = membershipRows[0] as TenantUserAccessRow;
    return {
      status: 'active',
      row: {
        tenant_id: membership.tenant_id,
        email: membership.email,
        rol: membership.rol,
        nombre: membership.nombre,
        plan: membership.plan ?? 'basico',
        allowed_branch_ids: Array.isArray(membership.allowed_branch_ids) ? membership.allowed_branch_ids : [],
        default_branch_id: typeof membership.default_branch_id === "string" ? membership.default_branch_id : null,
      },
    };
  }
  if (membershipResolution.status === 'cardinality_error') return membershipResolution;

  const { data: byAuth, error: byAuthError } = await withRetry(
    'tenant_users activo por auth_user_id',
    () => fetchTenantUserByAuthId(user.id),
  );
  rememberCloudFailure(byAuthError);
  if (byAuth) {
    return resolveActiveTenantUserRow(byAuth, user);
  }

  const email = user.email;
  if (email) {
    const { data: byEmail, error: byEmailError } = await withRetry(
      'tenant_users activo por email',
      () => fetchTenantUserBySessionEmail(email),
    );
    rememberCloudFailure(byEmailError);
    if (byEmail) {
      return resolveActiveTenantUserRow(byEmail, user);
    }
  }

  const { data: byRpc, error: byRpcError } = await withRetry(
    'tenant_users activo por rpc',
    fetchTenantUserByRpc,
  );
  rememberCloudFailure(byRpcError);
  if (byRpc) {
    return resolveActiveTenantUserRow(byRpc, user);
  }

  const { data: anyByAuth, error: anyByAuthError } = await withRetry(
    'tenant_users cualquier estado por auth_user_id',
    () => fetchAnyTenantUserByAuthId(user.id),
  );
  rememberCloudFailure(anyByAuthError);

  let anyByEmail: TenantUserAccessRow | null = null;
  if (!anyByAuth && email) {
    const anyByEmailResult = await withRetry(
      'tenant_users cualquier estado por email',
      () => fetchAnyTenantUserBySessionEmail(email),
    );
    anyByEmail = anyByEmailResult.data;
    rememberCloudFailure(anyByEmailResult.error);
  }

  const inactiveRow = (anyByAuth || anyByEmail) as TenantUserAccessRow | null;

  if (!inactiveRow) {
    if (cloudFailure) {
      const cached = preserveCachedAccessDuringCloudFailure(user, cloudFailure);
      if (cached) return cached;
    }
    return { status: 'truly_unlinked' };
  }
  if (inactiveRow.activo === false) return { status: 'blocked', tenantId: inactiveRow.tenant_id };

  const { data: tenantState, error: tenantStateError } = await withRetry(
    'tenants estado activo',
    () => fetchTenantActiveState(inactiveRow.tenant_id),
  );
  if (tenantStateError) {
    const cached = preserveCachedAccessDuringCloudFailure(
      user,
      tenantStateError,
      inactiveRow.tenant_id,
    );
    if (cached) return cached;

    console.warn(
      'resolveTenantUser: no se pudo validar el tenant; se conserva la membresía activa encontrada',
      tenantStateError,
    );
    return {
      status: 'active',
      row: {
        tenant_id: inactiveRow.tenant_id,
        email: inactiveRow.email,
        rol: inactiveRow.rol,
        nombre: inactiveRow.nombre,
        plan: inactiveRow.plan ?? 'basico',
      },
    };
  }
  if ((tenantState as TenantActiveRow | null)?.activa !== true) {
    return { status: 'blocked', tenantId: inactiveRow.tenant_id };
  }

  return { status: 'truly_unlinked' };
}

export async function resolveTenantUserForSession(user: UserSchema): Promise<TenantSessionRow | null> {
  const resolution = await resolveTenantAccessForSession(user);
  return resolution.status === 'active' ? resolution.row : null;
}
