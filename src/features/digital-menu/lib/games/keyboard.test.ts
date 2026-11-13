import { describe, expect, it } from "vitest";
import {
  shouldHandleGameKey,
  DEFAULT_GAME_KEYS,
  GAME_2048_KEYS,
  SNAKE_GAME_KEYS,
} from "./keyboard";

describe("shouldHandleGameKey", () => {
  it("returns true for valid directional keys with no modifiers and null target", () => {
    for (const key of DEFAULT_GAME_KEYS) {
      expect(
        shouldHandleGameKey({
          key,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          target: null,
        })
      ).toBe(true);
    }
  });

  it("returns false when ctrlKey is true (e.g. Ctrl+S, Ctrl+D, Ctrl+W)", () => {
    expect(
      shouldHandleGameKey({
        key: "s",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        target: null,
      })
    ).toBe(false);

    expect(
      shouldHandleGameKey({
        key: "d",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        target: null,
      })
    ).toBe(false);

    expect(
      shouldHandleGameKey({
        key: "w",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        target: null,
      })
    ).toBe(false);
  });

  it("returns false when metaKey is true (macOS Command shortcuts)", () => {
    expect(
      shouldHandleGameKey({
        key: "s",
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        target: null,
      })
    ).toBe(false);

    expect(
      shouldHandleGameKey({
        key: "a",
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        target: null,
      })
    ).toBe(false);
  });

  it("returns false when altKey is true", () => {
    expect(
      shouldHandleGameKey({
        key: "ArrowLeft",
        ctrlKey: false,
        metaKey: false,
        altKey: true,
        target: null,
      })
    ).toBe(false);

    expect(
      shouldHandleGameKey({
        key: "d",
        ctrlKey: false,
        metaKey: false,
        altKey: true,
        target: null,
      })
    ).toBe(false);
  });

  it("returns false when event target is an INPUT, TEXTAREA, or SELECT element", () => {
    const editableTags = ["INPUT", "input", "TEXTAREA", "textarea", "SELECT", "select"];

    for (const tagName of editableTags) {
      expect(
        shouldHandleGameKey({
          key: "w",
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          target: { tagName },
        })
      ).toBe(false);
    }
  });

  it("returns false when target has isContentEditable = true", () => {
    expect(
      shouldHandleGameKey({
        key: "a",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: { tagName: "DIV", isContentEditable: true },
      })
    ).toBe(false);
  });

  it("returns true when target is a non-editable element (DIV, BUTTON, CANVAS)", () => {
    expect(
      shouldHandleGameKey({
        key: "w",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: { tagName: "DIV", isContentEditable: false },
      })
    ).toBe(true);

    expect(
      shouldHandleGameKey({
        key: "s",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: { tagName: "BUTTON" },
      })
    ).toBe(true);

    expect(
      shouldHandleGameKey({
        key: "ArrowUp",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: { tagName: "CANVAS" },
      })
    ).toBe(true);
  });

  it("returns false for non-game keys", () => {
    const invalidKeys = ["Enter", "Escape", "Tab", "Shift", "x", "1", "Backspace"];
    for (const key of invalidKeys) {
      expect(
        shouldHandleGameKey({
          key,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          target: null,
        })
      ).toBe(false);
    }
  });

  it("supports custom allowedKeys lists (e.g. 2048 without space)", () => {
    expect(
      shouldHandleGameKey(
        {
          key: " ",
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          target: null,
        },
        GAME_2048_KEYS
      )
    ).toBe(false);

    expect(
      shouldHandleGameKey(
        {
          key: " ",
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          target: null,
        },
        SNAKE_GAME_KEYS
      )
    ).toBe(true);
  });

  it("returns false when event is null, undefined, or missing key", () => {
    expect(shouldHandleGameKey(null)).toBe(false);
    expect(shouldHandleGameKey(undefined)).toBe(false);
    expect(shouldHandleGameKey({})).toBe(false);
    expect(shouldHandleGameKey({ key: "" })).toBe(false);
  });
});
