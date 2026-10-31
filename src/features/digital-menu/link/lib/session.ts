const inMemorySessionStore = new Map<string, string>();

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== "undefined" && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage;
    }
  } catch {
    // Access denied or not available
  }
  return null;
}

/**
 * Generates a stable session ID for a given link token.
 * Reads from localStorage if available, falls back to in-memory storage if storage throws or is unavailable.
 */
export function getLinkSessionId(token: string): string {
  const key = `cb_link_session_${token.trim()}`;
  const storage = getLocalStorage();

  if (storage) {
    try {
      const stored = storage.getItem(key);
      if (stored && stored.trim().length > 0) {
        return stored.trim();
      }
    } catch {
      // LocalStorage might throw SecurityError
    }
  }

  const existingMemory = inMemorySessionStore.get(key);
  if (existingMemory) {
    return existingMemory;
  }

  const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  if (storage) {
    try {
      storage.setItem(key, newId);
    } catch {
      // Ignore
    }
  }

  inMemorySessionStore.set(key, newId);
  return newId;
}

export function clearLinkSessionId(token: string): void {
  const key = `cb_link_session_${token.trim()}`;
  inMemorySessionStore.delete(key);
  const storage = getLocalStorage();
  if (storage) {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore
    }
  }
}
