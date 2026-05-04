import type { UserSchema } from '@insforge/sdk';
import { insforgeClient } from './insforge';
import type { TenantSessionRow } from './tenantSessionCache';
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
    .maybeSingle();
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
export async function resolveTenantUserForSession(user: UserSchema): Promise<TenantSessionRow | null> {
  if (isSuperAdminEmail(user.email)) {
    return {
      tenant_id: SUPER_ADMIN_TENANT_ID,
      email: user.email ?? "",
      rol: SUPER_ADMIN_ROLE,
      nombre:
        typeof user.profile?.name === "string" && user.profile.name.trim()
          ? user.profile.name
          : "Super Admin",
    };
  }

  const { data: byAuth } = await withRetry('tenant_users por auth_user_id', () =>
    fetchTenantUserByAuthId(user.id)
  );
  if (byAuth) return byAuth as TenantSessionRow;

  const email = user.email;
  if (!email) return null;

  const { data: byEmail } = await withRetry('tenant_users por email', () =>
    fetchTenantUserBySessionEmail(email)
  );
  if (byEmail) return byEmail as TenantSessionRow;

  return null;
}
