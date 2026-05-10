import { getInsforgeResolvedBaseUrl } from './insforge';

/**
 * Registra un usuario en InsForge Auth vía REST API directo (POST /api/auth/users),
 * sin pasar por el SDK — para que NO se contamine la sesión activa del admin.
 *
 * Esto resuelve el bug donde `insforgeClient.auth.signUp()` reemplaza internamente
 * el access token del admin con el del nuevo usuario, causando que la app detecte
 * un cambio de sesión y redirija al login.
 */
export async function signUpWithoutSession(
  email: string,
  password: string
): Promise<{ userId: string | null; error: string | null }> {
  const baseUrl = getInsforgeResolvedBaseUrl();
  // Usar client_type=server para que no setee cookies ni toque el estado del navegador
  const url = `${baseUrl}/api/auth/users?client_type=server`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const body = await res.json();

    if (!res.ok) {
      const message =
        body?.message || body?.error || `Error ${res.status} al registrar usuario`;
      return { userId: null, error: message };
    }

    const userId: string | null = body?.user?.id ?? null;
    if (!userId) {
      return { userId: null, error: 'El servidor no devolvió el ID del usuario creado.' };
    }

    return { userId, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error de red al registrar usuario';
    return { userId: null, error: msg };
  }
}
