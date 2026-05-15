export interface RememberedLoginState {
  enabled: boolean;
  email?: string;
  shouldPersist: boolean;
}

export function parseRememberedLogin(raw: string | null): RememberedLoginState {
  if (!raw) return { enabled: false, shouldPersist: false };

  try {
    const parsed = JSON.parse(raw) as {
      enabled?: unknown;
      email?: unknown;
      password?: unknown;
    };

    if (parsed.enabled !== true) return { enabled: false, shouldPersist: false };

    const email = typeof parsed.email === "string" ? parsed.email : "";
    return { enabled: true, email, shouldPersist: true };
  } catch {
    return { enabled: false, shouldPersist: false };
  }
}

export function serializeRememberedLogin(email: string, _password?: string): string {
  return JSON.stringify({ enabled: true, email });
}
