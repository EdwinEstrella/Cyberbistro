/**
 * Keyboard input helpers for digital menu games.
 */

export const DEFAULT_GAME_KEYS: readonly string[] = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "w",
  "W",
  "a",
  "A",
  "s",
  "S",
  "d",
  "D",
  " ",
];

export const DIRECTION_GAME_KEYS: readonly string[] = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "w",
  "W",
  "a",
  "A",
  "s",
  "S",
  "d",
  "D",
];

export const SNAKE_GAME_KEYS = DEFAULT_GAME_KEYS;
export const GAME_2048_KEYS = DIRECTION_GAME_KEYS;

export interface GameKeyEventTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

export interface GameKeyEventLike {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: GameKeyEventTargetLike | EventTarget | null;
}

/**
 * Determines whether a keyboard event should be handled by a game.
 *
 * Hygiene rules:
 * 1. Ignore keystrokes accompanied by modifier keys (Ctrl, Meta/Command, Alt)
 *    so browser shortcuts such as Ctrl+S (Save), Ctrl+D (Bookmark), Ctrl+W (Close tab),
 *    Alt+Left (Back), etc. keep working uninterrupted.
 * 2. Ignore keystrokes directed at editable elements (INPUT, TEXTAREA, SELECT,
 *    or contenteditable regions).
 * 3. Verify the pressed key belongs to the allowed game keys list.
 */
export function shouldHandleGameKey(
  event: GameKeyEventLike | null | undefined,
  allowedKeys: readonly string[] = DEFAULT_GAME_KEYS
): boolean {
  if (!event || !event.key) {
    return false;
  }

  // 1. Modifiers: preserve browser shortcuts
  if (Boolean(event.ctrlKey) || Boolean(event.metaKey) || Boolean(event.altKey)) {
    return false;
  }

  // 2. Editable targets: preserve text input and selection
  const target = event.target as GameKeyEventTargetLike | null | undefined;
  if (target) {
    const tagName = typeof target.tagName === "string" ? target.tagName.toUpperCase() : undefined;
    if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
      return false;
    }
    if (Boolean(target.isContentEditable)) {
      return false;
    }
  }

  // 3. Game keys check
  return allowedKeys.includes(event.key);
}
