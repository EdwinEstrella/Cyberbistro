/**
 * Offline Logo Cache
 *
 * Converts remote logo URLs to base64 data URLs and persists them in
 * localStorage so that receipt printing works without internet.
 *
 * Strategy: use an HTMLImageElement + OffscreenCanvas/Canvas to draw
 * the image and export as data URL.  This avoids CORS issues that
 * plague raw `fetch` on storage-hosted images because the <img> tag
 * is allowed to render cross-origin images; we just need `crossorigin`
 * set so the canvas isn't tainted.  If canvas export still fails
 * (tainted canvas), we fall back to a raw `fetch` + FileReader approach.
 */

const STORAGE_PREFIX = "logo_b64_";

/** Maximum age before we refresh the cached version (7 days). */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  dataUrl: string;
  cachedAt: number;
}

function storageKey(remoteUrl: string): string {
  return `${STORAGE_PREFIX}${remoteUrl}`;
}

function readEntry(remoteUrl: string): CacheEntry | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(remoteUrl));
    if (!raw) return null;

    // Support both old format (plain data URL string) and new JSON format
    if (raw.startsWith("data:")) {
      return { dataUrl: raw, cachedAt: 0 };
    }

    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeEntry(remoteUrl: string, dataUrl: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const entry: CacheEntry = { dataUrl, cachedAt: Date.now() };
    localStorage.setItem(storageKey(remoteUrl), JSON.stringify(entry));
  } catch {
    // localStorage might be full — silently ignore
  }
}

/**
 * Synchronous: returns the base64 data URL if cached, otherwise `null`.
 * This is what receipt templates call at print time.
 */
export function getCachedLogoDataUrl(remoteUrl: string | null | undefined): string | null {
  if (!remoteUrl) return null;
  // If the URL is already a data URL, return it as-is
  if (remoteUrl.startsWith("data:")) return remoteUrl;
  const entry = readEntry(remoteUrl);
  return entry?.dataUrl ?? null;
}

/**
 * Returns the best available URL for rendering:
 * cached base64 if available, otherwise the original remote URL.
 */
export function getLogoUrlForPrint(remoteUrl: string | null | undefined): string | null {
  if (!remoteUrl) return null;
  if (remoteUrl.startsWith("data:")) return remoteUrl;
  return getCachedLogoDataUrl(remoteUrl) ?? remoteUrl;
}

/**
 * Returns true if the logo is cached and the cache is still fresh.
 */
export function isLogoCached(remoteUrl: string | null | undefined): boolean {
  if (!remoteUrl || remoteUrl.startsWith("data:")) return true;
  return readEntry(remoteUrl) !== null;
}

// ---------------------------------------------------------------------------
// Caching strategies
// ---------------------------------------------------------------------------

/**
 * Strategy 1: img + canvas
 * Loads the image via an <img> tag and draws it to a canvas to get a data URL.
 */
function cacheViaCanvas(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("No DOM"));
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error("Image load failed"));

    // Add cache-busting timestamp to avoid stale browser cache
    const separator = url.includes("?") ? "&" : "?";
    img.src = `${url}${separator}_t=${Date.now()}`;
  });
}

/**
 * Strategy 2: fetch + FileReader (fallback)
 */
async function cacheViaFetch(url: string): Promise<string> {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Downloads a remote logo URL, converts to base64, and stores in localStorage.
 * Safe to call multiple times — skips if already cached and fresh.
 * Returns the base64 data URL on success, or null on failure.
 */
export async function cacheLogoFromUrl(remoteUrl: string | null | undefined): Promise<string | null> {
  if (!remoteUrl || remoteUrl.startsWith("data:")) return remoteUrl ?? null;
  if (typeof localStorage === "undefined") return null;

  // Check if we already have a fresh cache
  const existing = readEntry(remoteUrl);
  if (existing && existing.cachedAt > 0 && (Date.now() - existing.cachedAt) < MAX_AGE_MS) {
    return existing.dataUrl;
  }

  // Must be online to download
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return existing?.dataUrl ?? null;
  }

  // Try canvas first (handles most CORS-friendly storage URLs),
  // fall back to fetch if canvas fails (tainted canvas)
  let dataUrl: string | null = null;
  try {
    dataUrl = await cacheViaCanvas(remoteUrl);
  } catch {
    try {
      dataUrl = await cacheViaFetch(remoteUrl);
    } catch {
      // Both failed — return whatever we have cached even if stale
      return existing?.dataUrl ?? null;
    }
  }

  if (dataUrl) {
    writeEntry(remoteUrl, dataUrl);
  }

  return dataUrl;
}

/**
 * Force re-download of a logo (e.g. after the user uploads a new one).
 */
export async function refreshLogoCache(remoteUrl: string | null | undefined): Promise<string | null> {
  if (!remoteUrl || remoteUrl.startsWith("data:")) return remoteUrl ?? null;

  // Remove old entry to force re-download
  if (typeof localStorage !== "undefined") {
    try { localStorage.removeItem(storageKey(remoteUrl)); } catch { /* */ }
  }

  return cacheLogoFromUrl(remoteUrl);
}
