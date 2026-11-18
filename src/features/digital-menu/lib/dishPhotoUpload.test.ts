import { describe, it, expect, vi } from "vitest";
import { uploadDishPhoto } from "./dishPhotoUpload";

describe("uploadDishPhoto", () => {
  const fakeBlob = new Blob(["test-webp-data"], { type: "image/webp" });
  const tenantId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const platoId = 42;
  const accessToken = "user-jwt-123";

  it("uploads photo and returns public URL on 201 success", async () => {
    let capturedUrl = "";
    let capturedOpts: RequestInit | undefined;

    const mockFetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      capturedUrl = url;
      capturedOpts = opts;
      return new Response(
        JSON.stringify({
          url: `https://fotos.azokia.com/${tenantId}/${platoId}-12345.webp`,
          key: `${tenantId}/${platoId}-12345.webp`,
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    const publicUrl = await uploadDishPhoto({
      blob: fakeBlob,
      tenantId,
      platoId,
      accessToken,
      endpoint: "https://fotos-api.azokia.com",
      fetchImpl: mockFetch,
    });

    expect(publicUrl).toBe(`https://fotos.azokia.com/${tenantId}/${platoId}-12345.webp`);
    expect(capturedUrl).toBe(
      `https://fotos-api.azokia.com/v1/dish-photos?tenant_id=${tenantId}&plato_id=${platoId}`
    );
    expect(capturedOpts?.method).toBe("POST");
    expect(capturedOpts?.headers).toEqual({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "image/webp",
    });
    expect(capturedOpts?.body).toBe(fakeBlob);
  });

  it("uses default endpoint https://fotos-api.azokia.com when endpoint is omitted", async () => {
    let capturedUrl = "";
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ url: "https://fotos.azokia.com/img.webp" }), {
        status: 201,
      });
    });

    await uploadDishPhoto({
      blob: fakeBlob,
      tenantId,
      platoId,
      accessToken,
      fetchImpl: mockFetch,
    });

    expect(capturedUrl.startsWith("https://fotos-api.azokia.com/v1/dish-photos")).toBe(true);
  });

  it("maps 401 response to DishPhotoError('invalid_token')", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      uploadDishPhoto({
        blob: fakeBlob,
        tenantId,
        platoId,
        accessToken,
        fetchImpl: mockFetch,
      })
    ).rejects.toMatchObject({
      name: "DishPhotoError",
      code: "invalid_token",
    });
  });

  it("maps 403 response to DishPhotoError('forbidden')", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      uploadDishPhoto({
        blob: fakeBlob,
        tenantId,
        platoId,
        accessToken,
        fetchImpl: mockFetch,
      })
    ).rejects.toMatchObject({
      name: "DishPhotoError",
      code: "forbidden",
    });
  });

  it("falls back to HTTP status when worker returns unrecognized error code (e.g. 403 -> forbidden)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "something_new" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      uploadDishPhoto({
        blob: fakeBlob,
        tenantId,
        platoId,
        accessToken,
        fetchImpl: mockFetch,
      })
    ).rejects.toMatchObject({
      name: "DishPhotoError",
      code: "forbidden",
    });
  });

  it("maps 413 response to DishPhotoError('too_large')", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "too_large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      uploadDishPhoto({
        blob: fakeBlob,
        tenantId,
        platoId,
        accessToken,
        fetchImpl: mockFetch,
      })
    ).rejects.toMatchObject({
      name: "DishPhotoError",
      code: "too_large",
    });
  });

  it("maps 415 response to DishPhotoError('unsupported_type')", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "unsupported_type" }), {
        status: 415,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      uploadDishPhoto({
        blob: fakeBlob,
        tenantId,
        platoId,
        accessToken,
        fetchImpl: mockFetch,
      })
    ).rejects.toMatchObject({
      name: "DishPhotoError",
      code: "unsupported_type",
    });
  });

  it("maps network fetch failure to DishPhotoError('network')", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    await expect(
      uploadDishPhoto({
        blob: fakeBlob,
        tenantId,
        platoId,
        accessToken,
        fetchImpl: mockFetch,
      })
    ).rejects.toMatchObject({
      name: "DishPhotoError",
      code: "network",
    });
  });

  it("handles non-JSON error response fallback via status code", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("Bad Gateway", {
        status: 502,
      })
    );

    await expect(
      uploadDishPhoto({
        blob: fakeBlob,
        tenantId,
        platoId,
        accessToken,
        fetchImpl: mockFetch,
      })
    ).rejects.toMatchObject({
      name: "DishPhotoError",
      code: "auth_unavailable",
    });
  });
});
