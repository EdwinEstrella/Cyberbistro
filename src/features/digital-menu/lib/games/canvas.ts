/**
 * Canvas drawing helpers for digital menu games.
 */

/**
 * Safely fills a rounded rectangle on a 2D canvas context.
 *
 * `CanvasRenderingContext2D.prototype.roundRect` was only added in Safari 16+
 * and modern Chromium/Firefox. Older WebViews and older iOS devices throw a TypeError
 * if roundRect is called directly.
 *
 * This helper uses `ctx.roundRect` when available, falling back to a manual
 * path with `arcTo`, or `fillRect` if the radius is zero or path APIs are unavailable.
 */
export function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  if (w <= 0 || h <= 0) {
    return;
  }

  const maxRadius = Math.max(0, Math.min(w / 2, h / 2));
  const radius = Math.max(0, Math.min(r, maxRadius));

  if (radius === 0) {
    ctx.fillRect(x, y, w, h);
    return;
  }

  ctx.beginPath();
  const ctxWithRoundRect = ctx as unknown as {
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
  };

  if (typeof ctxWithRoundRect.roundRect === "function") {
    ctxWithRoundRect.roundRect(x, y, w, h, radius);
  } else if (typeof ctx.arcTo === "function" && typeof ctx.moveTo === "function") {
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    if (typeof ctx.closePath === "function") {
      ctx.closePath();
    }
  } else if (typeof ctx.rect === "function") {
    ctx.rect(x, y, w, h);
  } else {
    ctx.fillRect(x, y, w, h);
    return;
  }

  ctx.fill();
}
