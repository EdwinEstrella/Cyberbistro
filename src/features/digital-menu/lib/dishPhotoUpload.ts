import {
  DishPhotoError,
  isDishPhotoErrorCode,
  type DishPhotoErrorCode,
} from "./dishPhotoErrors";

export interface UploadDishPhotoParams {
  blob: Blob;
  tenantId: string;
  platoId: number;
  accessToken: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Uploads a WebP blob to the menu photos worker, which authenticates via Supabase
 * and writes to Cloudflare R2. Returns the public URL of the uploaded image.
 */
export async function uploadDishPhoto({
  blob,
  tenantId,
  platoId,
  accessToken,
  endpoint,
  fetchImpl = fetch,
}: UploadDishPhotoParams): Promise<string> {
  const defaultEndpoint =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_MENU_PHOTOS_API_URL) ||
    "https://fotos-api.azokia.com";

  const base = (endpoint || defaultEndpoint).replace(/\/+$/, "");
  const url = `${base}/v1/dish-photos?tenant_id=${encodeURIComponent(tenantId)}&plato_id=${encodeURIComponent(String(platoId))}`;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/webp",
      },
      body: blob,
    });
  } catch (err) {
    throw new DishPhotoError("network", (err as Error)?.message);
  }

  if (res.status === 201) {
    let data: { url?: string };
    try {
      data = (await res.json()) as { url?: string };
    } catch {
      throw new DishPhotoError("unknown", "Respuesta no es JSON válido");
    }

    if (!data?.url || typeof data.url !== "string") {
      throw new DishPhotoError("unknown", "La respuesta no incluye URL");
    }

    return data.url;
  }

  let code: DishPhotoErrorCode = "unknown";
  try {
    const errorBody = (await res.json()) as { error?: unknown };
    if (errorBody && isDishPhotoErrorCode(errorBody.error)) {
      code = errorBody.error;
    }
  } catch {
    // If not JSON, map using HTTP status
  }

  if (code === "unknown") {
    if (res.status === 401) code = "invalid_token";
    else if (res.status === 403) code = "forbidden";
    else if (res.status === 413) code = "too_large";
    else if (res.status === 415) code = "unsupported_type";
    else if (res.status === 502) code = "auth_unavailable";
  }

  throw new DishPhotoError(code);
}
