export interface RememberedLoginState {
  email: string | null;
  hadLegacySecret: boolean;
}

type StorageLike = Pick<Storage, "getItem" | "removeItem">;

export function consumeRememberedLogin(storage: StorageLike, key: string): RememberedLoginState {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } finally {
    // Remove legacy plaintext data even if parsing or storage reads fail.
    storage.removeItem(key);
  }
  return parseRememberedLogin(raw);
}

export function parseRememberedLogin(raw: string | null): RememberedLoginState {
  if (!raw) return { email: null, hadLegacySecret: false };

  try {
    const parsed = JSON.parse(raw) as {
      enabled?: unknown;
      email?: unknown;
      password?: unknown;
    };

    const email = typeof parsed.email === "string" && parsed.email.trim() ? parsed.email.trim() : null;
    return { email, hadLegacySecret: typeof parsed.password === "string" && parsed.password.length > 0 };
  } catch {
    return { email: null, hadLegacySecret: false };
  }
}
