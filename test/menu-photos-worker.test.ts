import { describe, it, expect, vi } from "vitest";
import {
  handleRequest,
  type Env,
  type R2BucketLike,
  CORS_HEADERS,
} from "../workers/menu-photos/src/handler";

function createFakeWebp(size = 32): Uint8Array {
  const buf = new Uint8Array(Math.max(12, size));
  // 'RIFF'
  buf[0] = 0x52;
  buf[1] = 0x49;
  buf[2] = 0x46;
  buf[3] = 0x46;
  // 'WEBP'
  buf[8] = 0x57;
  buf[9] = 0x45;
  buf[10] = 0x42;
  buf[11] = 0x50;
  return buf;
}

const VALID_TENANT = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_PLATO = "42";
const VALID_TOKEN = "valid-user-jwt-token";

function createMockEnv(): {
  env: Env;
  putMock: ReturnType<typeof vi.fn>;
} {
  const putMock = vi.fn().mockResolvedValue({ key: "saved" });
  const mockBucket: R2BucketLike = {
    put: putMock,
  };

  return {
    env: {
      PHOTOS: mockBucket,
      SUPABASE_URL: "https://cloudix-db.azokia.com",
      SUPABASE_ANON_KEY: "public-anon-key-123",
      PUBLIC_BASE_URL: "https://fotos.azokia.com",
    },
    putMock,
  };
}

function expectCorsHeaders(res: Response) {
  for (const [key, val] of Object.entries(CORS_HEADERS)) {
    expect(res.headers.get(key.toLowerCase())).toBe(val);
  }
}

describe("menu-photos worker handler", () => {
  it("handles OPTIONS with 204 and CORS headers", async () => {
    const { env } = createMockEnv();
    const req = new Request("https://fotos-api.azokia.com/v1/dish-photos", {
      method: "OPTIONS",
    });

    const res = await handleRequest(req, env);
    expect(res.status).toBe(204);
    expectCorsHeaders(res);
    expect(await res.text()).toBe("");
  });

  it("rejects non-POST methods with 405 method_not_allowed", async () => {
    const { env } = createMockEnv();
    const methods = ["GET", "PUT", "DELETE", "PATCH"];

    for (const method of methods) {
      const req = new Request("https://fotos-api.azokia.com/v1/dish-photos", {
        method,
      });
      const res = await handleRequest(req, env);
      expect(res.status).toBe(405);
      expectCorsHeaders(res);
      const json = await res.json();
      expect(json).toEqual({ error: "method_not_allowed" });
    }
  });

  it("rejects unexpected paths with 404 not_found", async () => {
    const { env } = createMockEnv();
    const req = new Request("https://fotos-api.azokia.com/v1/other-endpoint", {
      method: "POST",
    });

    const res = await handleRequest(req, env);
    expect(res.status).toBe(404);
    expectCorsHeaders(res);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("rejects missing or invalid Authorization header with 401 missing_token", async () => {
    const { env } = createMockEnv();
    const cases = [
      {},
      { authorization: "" },
      { authorization: "Basic xyz123" },
      { authorization: "Bearer " },
      { authorization: "Bearer    " },
    ];

    for (const headers of cases) {
      const req = new Request(
        `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${VALID_TENANT}&plato_id=${VALID_PLATO}`,
        {
          method: "POST",
          headers,
        }
      );
      const res = await handleRequest(req, env);
      expect(res.status).toBe(401);
      expectCorsHeaders(res);
      expect(await res.json()).toEqual({ error: "missing_token" });
    }
  });

  it("rejects invalid or missing tenant_id with 400 invalid_tenant", async () => {
    const { env } = createMockEnv();
    const invalidTenants = ["", "123", "not-a-uuid", "a0eebc99-9c0b-4ef8-bb6d"];

    for (const tenant of invalidTenants) {
      const query = tenant ? `?tenant_id=${tenant}&plato_id=${VALID_PLATO}` : `?plato_id=${VALID_PLATO}`;
      const req = new Request(`https://fotos-api.azokia.com/v1/dish-photos${query}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });
      const res = await handleRequest(req, env);
      expect(res.status).toBe(400);
      expectCorsHeaders(res);
      expect(await res.json()).toEqual({ error: "invalid_tenant" });
    }
  });

  it("rejects invalid or non-positive plato_id with 400 invalid_plato", async () => {
    const { env } = createMockEnv();
    const invalidPlatos = ["", "0", "-1", "abc", "1.5", "01"];

    for (const plato of invalidPlatos) {
      const query = plato
        ? `?tenant_id=${VALID_TENANT}&plato_id=${plato}`
        : `?tenant_id=${VALID_TENANT}`;
      const req = new Request(`https://fotos-api.azokia.com/v1/dish-photos${query}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });
      const res = await handleRequest(req, env);
      expect(res.status).toBe(400);
      expectCorsHeaders(res);
      expect(await res.json()).toEqual({ error: "invalid_plato" });
    }
  });

  it("rejects non-webp content-type with 415 unsupported_type", async () => {
    const { env } = createMockEnv();
    const types = ["image/jpeg", "image/png", "application/octet-stream", "text/plain"];

    for (const contentType of types) {
      const req = new Request(
        `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${VALID_TENANT}&plato_id=${VALID_PLATO}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${VALID_TOKEN}`,
            "Content-Type": contentType,
          },
          body: createFakeWebp(),
        }
      );
      const res = await handleRequest(req, env);
      expect(res.status).toBe(415);
      expectCorsHeaders(res);
      expect(await res.json()).toEqual({ error: "unsupported_type" });
    }
  });

  it("rejects payload exceeding 1_500_000 bytes via Content-Length header with 413 too_large", async () => {
    const { env } = createMockEnv();
    const req = new Request(
      `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${VALID_TENANT}&plato_id=${VALID_PLATO}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
          "Content-Type": "image/webp",
          "Content-Length": "1500001",
        },
        body: createFakeWebp(),
      }
    );

    const res = await handleRequest(req, env);
    expect(res.status).toBe(413);
    expectCorsHeaders(res);
    expect(await res.json()).toEqual({ error: "too_large" });
  });

  it("rejects payload exceeding 1_500_000 bytes via actual byte length with 413 too_large", async () => {
    const { env } = createMockEnv();
    const largeBuffer = createFakeWebp(1_500_001);

    const req = new Request(
      `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${VALID_TENANT}&plato_id=${VALID_PLATO}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
          "Content-Type": "image/webp",
        },
        body: largeBuffer,
      }
    );

    const res = await handleRequest(req, env);
    expect(res.status).toBe(413);
    expectCorsHeaders(res);
    expect(await res.json()).toEqual({ error: "too_large" });
  });

  it("rejects invalid magic bytes (< 12 bytes or not RIFF....WEBP) with 415 unsupported_type", async () => {
    const { env } = createMockEnv();

    // 1. Shorter than 12 bytes
    const shortBuffer = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    const reqShort = new Request(
      `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${VALID_TENANT}&plato_id=${VALID_PLATO}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
          "Content-Type": "image/webp",
        },
        body: shortBuffer,
      }
    );
    const resShort = await handleRequest(reqShort, env);
    expect(resShort.status).toBe(415);
    expectCorsHeaders(resShort);
    expect(await resShort.json()).toEqual({ error: "unsupported_type" });

    // 2. 12 bytes but not RIFF
    const notRiff = new Uint8Array(16);
    notRiff[8] = 0x57;
    notRiff[9] = 0x45;
    notRiff[10] = 0x42;
    notRiff[11] = 0x50;
    const reqNotRiff = new Request(
      `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${VALID_TENANT}&plato_id=${VALID_PLATO}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
          "Content-Type": "image/webp",
        },
        body: notRiff,
      }
    );
    const resNotRiff = await handleRequest(reqNotRiff, env);
    expect(resNotRiff.status).toBe(415);
    expectCorsHeaders(resNotRiff);
    expect(await resNotRiff.json()).toEqual({ error: "unsupported_type" });

    // 3. RIFF but not WEBP
    const notWebp = new Uint8Array(16);
    notWebp[0] = 0x52;
    notWebp[1] = 0x49;
    notWebp[2] = 0x46;
    notWebp[3] = 0x46;
    const reqNotWebp = new Request(
      `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${VALID_TENANT}&plato_id=${VALID_PLATO}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
          "Content-Type": "image/webp",
        },
        body: notWebp,
      }
    );
    const resNotWebp = await handleRequest(reqNotWebp, env);
    expect(resNotWebp.status).toBe(415);
    expectCorsHeaders(resNotWebp);
    expect(await resNotWebp.json()).toEqual({ error: "unsupported_type" });
  });

  it("handles PostgREST 401/403 with 401 invalid_token", async () => {
    const { env } = createMockEnv();

    for (const status of [401, 403]) {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "JWT expired" }), {
          status,
          headers: { "Content-Type": "application/json" },
        })
      );

      const req = new Request(
        `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${VALID_TENANT}&plato_id=${VALID_PLATO}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${VALID_TOKEN}`,
            "Content-Type": "image/webp",
          },
          body: createFakeWebp(),
        }
      );

      const res = await handleRequest(req, env, { fetch: mockFetch });
      expect(res.status).toBe(401);
      expectCorsHeaders(res);
      expect(await res.json()).toEqual({ error: "invalid_token" });
    }
  });

  it("handles Supabase RPC server error or network exception with 502 auth_unavailable", async () => {
    const { env } = createMockEnv();

    // 1. 500 response
    const mockFetch500 = vi.fn().mockResolvedValue(
      new Response("Internal Server Error", {
        status: 500,
      })
    );
    const req1 = new Request(
      `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${VALID_TENANT}&plato_id=${VALID_PLATO}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
          "Content-Type": "image/webp",
        },
        body: createFakeWebp(),
      }
    );
    const res1 = await handleRequest(req1, env, { fetch: mockFetch500 });
    expect(res1.status).toBe(502);
    expectCorsHeaders(res1);
    expect(await res1.json()).toEqual({ error: "auth_unavailable" });

    // 2. Network throw
    const mockFetchThrow = vi.fn().mockRejectedValue(new Error("Connection refused"));
    const req2 = new Request(
      `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${VALID_TENANT}&plato_id=${VALID_PLATO}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
          "Content-Type": "image/webp",
        },
        body: createFakeWebp(),
      }
    );
    const res2 = await handleRequest(req2, env, { fetch: mockFetchThrow });
    expect(res2.status).toBe(502);
    expectCorsHeaders(res2);
    expect(await res2.json()).toEqual({ error: "auth_unavailable" });
  });

  it("rejects caller when tenant_id is not in admin array with 403 forbidden", async () => {
    const { env } = createMockEnv();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(["other-tenant-uuid-1", "other-tenant-uuid-2"]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const req = new Request(
      `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${VALID_TENANT}&plato_id=${VALID_PLATO}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
          "Content-Type": "image/webp",
        },
        body: createFakeWebp(),
      }
    );

    const res = await handleRequest(req, env, { fetch: mockFetch });
    expect(res.status).toBe(403);
    expectCorsHeaders(res);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("successfully stores photo, checks RPC call, key format with injected now, R2 metadata, and returns 201", async () => {
    const { env, putMock } = createMockEnv();
    const fakeNow = 1716000000123;
    const webpData = createFakeWebp(64);

    let capturedUrl = "";
    let capturedOptions: RequestInit | undefined;
    const mockFetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      capturedUrl = url;
      capturedOptions = opts;
      return new Response(JSON.stringify([VALID_TENANT]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = new Request(
      `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${VALID_TENANT}&plato_id=${VALID_PLATO}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
          "Content-Type": "image/webp",
        },
        body: webpData,
      }
    );

    const res = await handleRequest(req, env, {
      fetch: mockFetch,
      now: () => fakeNow,
    });

    // 1. Verify status and CORS
    expect(res.status).toBe(201);
    expectCorsHeaders(res);

    // 2. Verify RPC call exact url, headers and body
    expect(capturedUrl).toBe(
      "https://cloudix-db.azokia.com/rest/v1/rpc/cyberbistro_current_admin_tenant_ids"
    );
    expect(capturedOptions?.method).toBe("POST");
    expect(capturedOptions?.headers).toEqual({
      apikey: "public-anon-key-123",
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Content-Type": "application/json",
    });
    expect(capturedOptions?.body).toBe("{}");

    // 3. Verify key format: <tenant_id>/<plato_id>-<now()>.webp
    const expectedKey = `${VALID_TENANT}/${VALID_PLATO}-${fakeNow}.webp`;

    // 4. Verify R2 put call
    expect(putMock).toHaveBeenCalledOnce();
    const [putKey, putBody, putOpts] = putMock.mock.calls[0];
    expect(putKey).toBe(expectedKey);
    expect(new Uint8Array(putBody)).toEqual(webpData);
    expect(putOpts).toEqual({
      httpMetadata: {
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
      },
    });

    // 5. Verify response body
    const json = await res.json();
    expect(json).toEqual({
      url: `https://fotos.azokia.com/${expectedKey}`,
      key: expectedKey,
    });
  });
});
