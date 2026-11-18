import { DishPhotoError } from "./dishPhotoErrors";

export interface SquareCrop {
  sx: number;
  sy: number;
  size: number;
  target: number;
}

export interface CanvasContext2DLike {
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
}

export interface CanvasLike {
  getContext(type: "2d"): CanvasContext2DLike | null;
  convertToBlob?(options?: { type: string; quality?: number }): Promise<Blob>;
  toBlob?(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

export interface ProcessDishPhotoDeps {
  createImageBitmap?: (image: Blob) => Promise<ImageBitmap>;
  createCanvas?: (width: number, height: number) => CanvasLike;
}

/**
 * Computes a center-square crop of the source image and scales it down
 * to at most maxSize (default 800px).
 */
export function computeSquareCrop(
  width: number,
  height: number,
  maxSize = 800
): SquareCrop {
  const size = Math.min(width, height);
  const sx = Math.floor((width - size) / 2);
  const sy = Math.floor((height - size) / 2);
  const target = Math.min(size, maxSize);
  return { sx, sy, size, target };
}

async function encodeCanvasToWebp(canvas: CanvasLike, quality: number): Promise<Blob> {
  if (typeof canvas.convertToBlob === "function") {
    try {
      const blob = await canvas.convertToBlob({ type: "image/webp", quality });
      if (!blob || blob.type !== "image/webp") {
        throw new DishPhotoError("encode_failed");
      }
      return blob;
    } catch (err) {
      if (err instanceof DishPhotoError) throw err;
      throw new DishPhotoError("encode_failed");
    }
  }

  if (typeof canvas.toBlob === "function") {
    return new Promise<Blob>((resolve, reject) => {
      try {
        canvas.toBlob!(
          (blob) => {
            if (!blob || blob.type !== "image/webp") {
              reject(new DishPhotoError("encode_failed"));
            } else {
              resolve(blob);
            }
          },
          "image/webp",
          quality
        );
      } catch {
        reject(new DishPhotoError("encode_failed"));
      }
    });
  }

  throw new DishPhotoError("encode_failed");
}

/**
 * Decodes the image, crops it to a center square (up to 800x800), preserves transparency,
 * and encodes as WebP at quality 0.82 (re-encoded at 0.7 if size > 1.5 MB).
 */
export async function processDishPhoto(
  file: Blob,
  deps?: ProcessDishPhotoDeps
): Promise<Blob> {
  const bitmapDecoder =
    deps?.createImageBitmap ??
    (typeof createImageBitmap !== "undefined" ? createImageBitmap : undefined);

  if (!bitmapDecoder) {
    throw new DishPhotoError("unsupported_format");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await bitmapDecoder(file);
  } catch {
    throw new DishPhotoError("unsupported_format");
  }

  const { sx, sy, size, target } = computeSquareCrop(bitmap.width, bitmap.height, 800);

  let canvas: CanvasLike;
  if (deps?.createCanvas) {
    canvas = deps.createCanvas(target, target);
  } else if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(target, target);
  } else if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const el = document.createElement("canvas");
    el.width = target;
    el.height = target;
    canvas = el;
  } else {
    bitmap.close?.();
    throw new DishPhotoError("encode_failed");
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    throw new DishPhotoError("encode_failed");
  }

  try {
    // Draw cropped square region without background fill to preserve alpha transparency
    ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, target, target);
  } finally {
    bitmap.close?.();
  }

  let encoded = await encodeCanvasToWebp(canvas, 0.82);
  if (encoded.size > 1_500_000) {
    encoded = await encodeCanvasToWebp(canvas, 0.7);
  }

  return encoded;
}
