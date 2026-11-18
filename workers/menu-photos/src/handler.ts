export interface R2BucketLike {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
    options?: {
      httpMetadata?: {
        contentType?: string;
        cacheControl?: string;
        [key: string]: unknown;
      };
      customMetadata?: Record<string, string>;
      [key: string]: unknown;
    }
  ): Promise<unknown>;
}

export interface Env {
  PHOTOS: R2BucketLike;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  PUBLIC_BASE_URL: string;
}

export interface HandlerDeps {
  fetch?: typeof fetch;
  now?: () => number;
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITIVE_INT_REGEX = /^[1-9]\d*$/;
const MAX_BYTES = 1_500_000;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(code: string, status: number): Response {
  return jsonResponse({ error: code }, status);
}

function isRiffWebp(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const bytes = new Uint8Array(buffer, 0, 12);
  return (
    bytes[0] === 0x52 && // 'R'
    bytes[1] === 0x49 && // 'I'
    bytes[2] === 0x46 && // 'F'
    bytes[3] === 0x46 && // 'F'
    bytes[8] === 0x57 && // 'W'
    bytes[9] === 0x45 && // 'E'
    bytes[10] === 0x42 && // 'B'
    bytes[11] === 0x50 // 'P'
  );
}

export async function handleRequest(
  request: Request,
  env: Env,
  deps?: HandlerDeps
): Promise<Response> {
  // 1. 405 non-POST/OPTIONS
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== "POST") {
    return errorResponse("method_not_allowed", 405);
  }

  // 2. 404 other paths
  const url = new URL(request.url);
  if (url.pathname !== "/v1/dish-photos") {
    return errorResponse("not_found", 404);
  }

  // 3. 401 missing_token (no Bearer)
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse("missing_token", 401);
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return errorResponse("missing_token", 401);
  }

  // 4. 400 invalid_tenant (not uuid), invalid_plato (not positive int)
  const tenantId = url.searchParams.get("tenant_id");
  if (!tenantId || !UUID_REGEX.test(tenantId)) {
    return errorResponse("invalid_tenant", 400);
  }

  const platoId = url.searchParams.get("plato_id");
  if (!platoId || !POSITIVE_INT_REGEX.test(platoId)) {
    return errorResponse("invalid_plato", 400);
  }

  // 5. 415 unsupported_type unless content-type is image/webp
  const rawContentType = request.headers.get("content-type") || "";
  const contentType = rawContentType.toLowerCase().split(";")[0].trim();
  if (contentType !== "image/webp") {
    return errorResponse("unsupported_type", 415);
  }

  // 6. 413 too_large if > 1_500_000 bytes (check content-length first, then actual byte length)
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsedLength = parseInt(contentLength, 10);
    if (!isNaN(parsedLength) && parsedLength > MAX_BYTES) {
      return errorResponse("too_large", 413);
    }
  }

  const bodyBuffer = await request.arrayBuffer();
  if (bodyBuffer.byteLength > MAX_BYTES) {
    return errorResponse("too_large", 413);
  }

  // 7. 415 unsupported_type unless first 12 bytes are RIFF....WEBP
  if (!isRiffWebp(bodyBuffer)) {
    return errorResponse("unsupported_type", 415);
  }

  // 8. Authorize via Supabase RPC
  const fetchImpl = deps?.fetch ?? fetch;
  const nowImpl = deps?.now ?? Date.now;

  const rpcUrl = `${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/cyberbistro_current_admin_tenant_ids`;
  let authRes: Response;
  try {
    authRes = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  } catch {
    return errorResponse("auth_unavailable", 502);
  }

  if (authRes.status === 401 || authRes.status === 403) {
    return errorResponse("invalid_token", 401);
  }

  if (!authRes.ok) {
    return errorResponse("auth_unavailable", 502);
  }

  let adminTenantIds: unknown;
  try {
    adminTenantIds = await authRes.json();
  } catch {
    return errorResponse("auth_unavailable", 502);
  }

  if (
    !Array.isArray(adminTenantIds) ||
    !adminTenantIds.some(
      (id) => typeof id === "string" && id.toLowerCase() === tenantId.toLowerCase()
    )
  ) {
    return errorResponse("forbidden", 403);
  }

  // 9. Store in R2 bucket
  const key = `${tenantId}/${platoId}-${nowImpl()}.webp`;
  await env.PHOTOS.put(key, bodyBuffer, {
    httpMetadata: {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  // 10. 201 Created
  const publicBase = env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  return jsonResponse(
    {
      url: `${publicBase}/${key}`,
      key,
    },
    201
  );
}
