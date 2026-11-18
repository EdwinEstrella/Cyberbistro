import { describe, it, expect, vi } from "vitest";
import {
  computeSquareContain,
  processDishPhoto,
  type CanvasLike,
} from "./dishPhotoProcessing";

describe("computeSquareContain", () => {
  it("computes containment for portrait images", () => {
    // 600x1200 -> side 800, dw 400, dh 800, dx 200, dy 0
    const contain = computeSquareContain(600, 1200, 800);
    expect(contain).toEqual({ side: 800, dx: 200, dy: 0, dw: 400, dh: 800 });
  });

  it("computes containment for landscape images", () => {
    // 1600x900 -> side 800, dw 800, dh 450, dx 0, dy 175
    const contain = computeSquareContain(1600, 900, 800);
    expect(contain).toEqual({ side: 800, dx: 0, dy: 175, dw: 800, dh: 450 });
  });

  it("computes containment for square images", () => {
    // 1000x1000 -> 800 full
    const contain = computeSquareContain(1000, 1000, 800);
    expect(contain).toEqual({ side: 800, dx: 0, dy: 0, dw: 800, dh: 800 });
  });

  it("does not upscale small images", () => {
    // 300x200 -> side 300, dw 300, dh 200, dy 50
    const contain = computeSquareContain(300, 200, 800);
    expect(contain).toEqual({ side: 300, dx: 0, dy: 50, dw: 300, dh: 200 });
  });

  it("handles odd pixel dimensions correctly", () => {
    // 503 x 700 -> side 700, dw 503, dh 700, dx 98, dy 0
    const odd1 = computeSquareContain(503, 700, 800);
    expect(odd1).toEqual({ side: 700, dx: 98, dy: 0, dw: 503, dh: 700 });
    
    // 1001 x 601 -> side 800, dw 800, dh 480, dx 0, dy 160
    const odd2 = computeSquareContain(1001, 601, 800);
    expect(odd2).toEqual({ side: 800, dx: 0, dy: 160, dw: 800, dh: 480 });
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

  it("fits image inside square with no background fill, closes bitmap, and encodes WebP at 0.82 quality", async () => {
    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/png" });
    const closeMock = vi.fn();
    const mockBitmap = {
      width: 600,
      height: 1200,
      close: closeMock,
    } as unknown as ImageBitmap;

    const drawImageMock = vi.fn();
    const fillRectMock = vi.fn();
    let fillStyleAssigned = false;
    const mockCtx = {
      drawImage: drawImageMock,
      fillRect: fillRectMock,
      get fillStyle() {
        return undefined;
      },
      set fillStyle(_val: unknown) {
        fillStyleAssigned = true;
      },
      clearRect: vi.fn(),
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
    // Portrait 600x1200 -> side 800, dw 400, dh 800, dx 200, dy 0
    expect(drawImageMock).toHaveBeenCalledWith(mockBitmap, 0, 0, 600, 1200, 200, 0, 400, 800);
    expect(fillRectMock).not.toHaveBeenCalled();
    expect(fillStyleAssigned).toBe(false);
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
