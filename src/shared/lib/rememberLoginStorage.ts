export interface RememberedLoginState {
  enabled: boolean;
  email?: string;
  password?: string;
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
    const password = typeof parsed.password === "string" ? parsed.password : "";
    return { enabled: true, email, password, shouldPersist: true };
  } catch {
    return { enabled: false, shouldPersist: false };
  }
}

export function serializeRememberedLogin(email: string, password?: string): string {
  return JSON.stringify({ enabled: true, email, password: password || "" });
}
