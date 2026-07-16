export type AuthRefreshTrigger = "focus" | "visibility" | "interval" | "manual";

const DEFAULT_DEDUPE_WINDOW_MS = 1_500;

/** Coalesces the focus/visibility burst emitted by Electron when restoring a window. */
export class AuthRefreshCoordinator {
  private lastAcceptedAt = -Infinity;

  constructor(private readonly dedupeWindowMs = DEFAULT_DEDUPE_WINDOW_MS) {}

  shouldRefresh(source: AuthRefreshTrigger, now = Date.now()): boolean {
    if (source === "manual") return true;
    if (now - this.lastAcceptedAt < this.dedupeWindowMs) return false;
    this.lastAcceptedAt = now;
    return true;
  }

  reset(): void {
    this.lastAcceptedAt = -Infinity;
  }
}
