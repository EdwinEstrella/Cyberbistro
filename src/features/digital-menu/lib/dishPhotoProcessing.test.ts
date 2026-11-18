import { describe, it, expect, vi } from "vitest";
import {
  computeSquareCrop,
  processDishPhoto,
  type CanvasLike,
} from "./dishPhotoProcessing";

describe("computeSquareCrop", () => {
  it("computes center-square crop for landscape images", () => {
    // 1200 x 800 -> size 800, sx (1200 - 800) / 2 = 200, sy 0, target 800
    const crop = computeSquareCrop(1200, 800, 800);
    expect(crop).toEqual({
      sx: 200,
      sy: 0,
      size: 800,
      target: 800,
    });
  });

  it("computes center-square crop for portrait images", () => {
    // 800 x 1200 -> size 800, sx 0, sy (1200 - 800) / 2 = 200, target 800
    const crop = computeSquareCrop(800, 1200, 800);
    expect(crop).toEqual({
      sx: 0,
      sy: 200,
      size: 800,
      target: 800,
    });
  });

  it("computes center-square crop for square images larger than maxSize", () => {
    // 1000 x 1000 -> size 1000, sx 0, sy 0, target capped to 800
    const crop = computeSquareCrop(1000, 1000, 800);
    expect(crop).toEqual({
      sx: 0,
      sy: 0,
      size: 1000,
      target: 800,
    });
  });

  it("does not upscale images smaller than maxSize", () => {
    // 400 x 300 -> size 300, sx 50, sy 0, target 300
    const crop = computeSquareCrop(400, 300, 800);
    expect(crop).toEqual({
      sx: 50,
      sy: 0,
      size: 300,
      target: 300,
    });

    // 600 x 600 -> size 600, sx 0, sy 0, target 600
    const squareSmall = computeSquareCrop(600, 600, 800);
    expect(squareSmall).toEqual({
      sx: 0,
      sy: 0,
      size: 600,
      target: 600,
    });
  });

  it("handles odd pixel dimensions cleanly with floor", () => {
    // 1001 x 601 -> size 601, sx (1001 - 601) / 2 = 200, sy 0, target 601
    const odd1 = computeSquareCrop(1001, 601, 800);
    expect(odd1).toEqual({
      sx: 200,
      sy: 0,
      size: 601,
      target: 601,
    });

    // 503 x 700 -> size 503, sx 0, sy Math.floor((700 - 503) / 2) = 98, target 503
    const odd2 = computeSquareCrop(503, 700, 800);
    expect(odd2).toEqual({
      sx: 0,
      sy: 98,
      size: 503,
      target: 503,
    });
  });
});

describe("processDishPhoto", () => {
  it("throws DishPhotoError('unsupported_format') when decode fails", async () => {
    const fakeBlob = new Blob(["invalid-heic-data"], { type: "image/heic" });
    const mockDecoder = vi.fn().mockRejectedValue(new Error("Unable to decode"));

    await expect(
      processDishPhoto(fakeBlob, { createImageBitmap: mockDecoder })
    ).rejects.toMatchObject({
      name: "DishPhotoError",
      code: "unsupported_format",
    });
  });

  it("throws DishPhotoError('encode_failed') when canvas context is unavailable", async () => {
    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    const closeMock = vi.fn();
    const mockBitmap = {
      width: 1000,
      height: 800,
      close: closeMock,
    } as unknown as ImageBitmap;

    const mockDecoder = vi.fn().mockResolvedValue(mockBitmap);
    const mockCanvasFactory = vi.fn().mockReturnValue({
      getContext: () => null,
    });

    await expect(
      processDishPhoto(fakeBlob, {
        createImageBitmap: mockDecoder,
        createCanvas: mockCanvasFactory,
      })
    ).rejects.toMatchObject({
      name: "DishPhotoError",
      code: "encode_failed",
    });

    expect(closeMock).toHaveBeenCalledOnce();
  });

  it("throws DishPhotoError('encode_failed') when resulting blob is not image/webp", async () => {
    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    const closeMock = vi.fn();
    const mockBitmap = {
      width: 800,
      height: 800,
      close: closeMock,
    } as unknown as ImageBitmap;

    const drawImageMock = vi.fn();
    const mockCtx = {
      drawImage: drawImageMock,
    } as unknown as CanvasRenderingContext2D;

    // Browser does not support WebP encoding and falls back to PNG
    const mockCanvas: CanvasLike = {
      getContext: () => mockCtx,
      convertToBlob: vi.fn().mockResolvedValue(new Blob(["fake-png"], { type: "image/png" })),
    };

    await expect(
      processDishPhoto(fakeBlob, {
        createImageBitmap: vi.fn().mockResolvedValue(mockBitmap),
        createCanvas: () => mockCanvas,
      })
    ).rejects.toMatchObject({
      name: "DishPhotoError",
      code: "encode_failed",
    });
  });

  it("crops, draws with no background fill, closes bitmap, and encodes WebP at 0.82 quality", async () => {
    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/png" });
    const closeMock = vi.fn();
    const mockBitmap = {
      width: 1200,
      height: 800,
      close: closeMock,
    } as unknown as ImageBitmap;

    const drawImageMock = vi.fn();
    const mockCtx = {
      drawImage: drawImageMock,
    } as unknown as CanvasRenderingContext2D;

    const convertToBlobMock = vi.fn().mockImplementation(async () => {
      return new Blob(["webp-data"], { type: "image/webp" });
    });

    const mockCanvas: CanvasLike = {
      getContext: () => mockCtx,
      convertToBlob: convertToBlobMock,
    };

    const result = await processDishPhoto(fakeBlob, {
      createImageBitmap: vi.fn().mockResolvedValue(mockBitmap),
      createCanvas: (w, h) => {
        expect(w).toBe(800);
        expect(h).toBe(800);
        return mockCanvas;
      },
    });

    expect(result.type).toBe("image/webp");
    // Center square crop of 1200x800: sx=200, sy=0, size=800, target=800
    expect(drawImageMock).toHaveBeenCalledWith(mockBitmap, 200, 0, 800, 800, 0, 0, 800, 800);
    expect(closeMock).toHaveBeenCalledOnce();
    expect(convertToBlobMock).toHaveBeenCalledOnce();
    expect(convertToBlobMock).toHaveBeenCalledWith({ type: "image/webp", quality: 0.82 });
  });

  it("retries at quality 0.7 if initial encoded blob exceeds 1_500_000 bytes", async () => {
    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    const mockBitmap = {
      width: 800,
      height: 800,
      close: vi.fn(),
    } as unknown as ImageBitmap;

    const drawImageMock = vi.fn();
    const mockCtx = {
      drawImage: drawImageMock,
    } as unknown as CanvasRenderingContext2D;

    const largeBlob = new Blob([new Uint8Array(1_600_000)], { type: "image/webp" });
    const smallerBlob = new Blob([new Uint8Array(900_000)], { type: "image/webp" });

    const convertToBlobMock = vi
      .fn()
      .mockResolvedValueOnce(largeBlob)
      .mockResolvedValueOnce(smallerBlob);

    const mockCanvas: CanvasLike = {
      getContext: () => mockCtx,
      convertToBlob: convertToBlobMock,
    };

    const result = await processDishPhoto(fakeBlob, {
      createImageBitmap: vi.fn().mockResolvedValue(mockBitmap),
      createCanvas: () => mockCanvas,
    });

    expect(result).toBe(smallerBlob);
    expect(convertToBlobMock).toHaveBeenCalledTimes(2);
    expect(convertToBlobMock).toHaveBeenNthCalledWith(1, { type: "image/webp", quality: 0.82 });
    expect(convertToBlobMock).toHaveBeenNthCalledWith(2, { type: "image/webp", quality: 0.7 });
  });

  it("supports fallback HTMLCanvasElement.toBlob when convertToBlob is not present", async () => {
    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    const mockBitmap = {
      width: 600,
      height: 600,
      close: vi.fn(),
    } as unknown as ImageBitmap;

    const mockCtx = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    const mockCanvas: CanvasLike = {
      getContext: () => mockCtx,
      toBlob: (cb, type, quality) => {
        expect(type).toBe("image/webp");
        expect(quality).toBe(0.82);
        cb(new Blob(["fallback-webp"], { type: "image/webp" }));
      },
    };

    const result = await processDishPhoto(fakeBlob, {
      createImageBitmap: vi.fn().mockResolvedValue(mockBitmap),
      createCanvas: () => mockCanvas,
    });

    expect(result.type).toBe("image/webp");
  });
});
