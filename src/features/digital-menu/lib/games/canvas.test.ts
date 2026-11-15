import { describe, expect, it, vi } from "vitest";
import { fillRoundedRect } from "./canvas";

describe("fillRoundedRect", () => {
  it("uses ctx.roundRect when available and calls ctx.fill", () => {
    const roundRectMock = vi.fn();
    const beginPathMock = vi.fn();
    const fillMock = vi.fn();

    const mockCtx = {
      roundRect: roundRectMock,
      beginPath: beginPathMock,
      fill: fillMock,
    } as unknown as CanvasRenderingContext2D;

    fillRoundedRect(mockCtx, 10, 20, 100, 50, 8);

    expect(beginPathMock).toHaveBeenCalledOnce();
    expect(roundRectMock).toHaveBeenCalledWith(10, 20, 100, 50, 8);
    expect(fillMock).toHaveBeenCalledOnce();
  });

  it("clamps radius when r exceeds half width or half height", () => {
    const roundRectMock = vi.fn();
    const mockCtx = {
      roundRect: roundRectMock,
      beginPath: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    // width 20, height 10 => maxRadius is 5
    fillRoundedRect(mockCtx, 0, 0, 20, 10, 15);

    expect(roundRectMock).toHaveBeenCalledWith(0, 0, 20, 10, 5);
  });

  it("falls back to manual arcTo path when ctx.roundRect is undefined (Safari < 16)", () => {
    const beginPathMock = vi.fn();
    const moveToMock = vi.fn();
    const arcToMock = vi.fn();
    const closePathMock = vi.fn();
    const fillMock = vi.fn();

    const mockCtx = {
      // roundRect is missing
      beginPath: beginPathMock,
      moveTo: moveToMock,
      arcTo: arcToMock,
      closePath: closePathMock,
      fill: fillMock,
    } as unknown as CanvasRenderingContext2D;

    fillRoundedRect(mockCtx, 10, 20, 100, 50, 6);

    expect(beginPathMock).toHaveBeenCalledOnce();
    expect(moveToMock).toHaveBeenCalledWith(16, 20); // x + radius
    expect(arcToMock).toHaveBeenCalledTimes(4);
    expect(closePathMock).toHaveBeenCalledOnce();
    expect(fillMock).toHaveBeenCalledOnce();
  });

  it("calls ctx.fillRect directly when radius is 0", () => {
    const fillRectMock = vi.fn();
    const beginPathMock = vi.fn();

    const mockCtx = {
      fillRect: fillRectMock,
      beginPath: beginPathMock,
      roundRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    fillRoundedRect(mockCtx, 5, 5, 40, 30, 0);

    expect(fillRectMock).toHaveBeenCalledWith(5, 5, 40, 30);
    expect(beginPathMock).not.toHaveBeenCalled();
  });

  it("safely exits without action when w <= 0 or h <= 0", () => {
    const beginPathMock = vi.fn();
    const fillRectMock = vi.fn();

    const mockCtx = {
      beginPath: beginPathMock,
      fillRect: fillRectMock,
    } as unknown as CanvasRenderingContext2D;

    fillRoundedRect(mockCtx, 0, 0, 0, 10, 4);
    fillRoundedRect(mockCtx, 0, 0, 10, 0, 4);
    fillRoundedRect(mockCtx, 0, 0, -5, -5, 4);

    expect(beginPathMock).not.toHaveBeenCalled();
    expect(fillRectMock).not.toHaveBeenCalled();
  });
});
