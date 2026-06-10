import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

export function useElectronInputFocusRecovery() {
  useEffect(() => {
    const ensureInputFocus = window.electronAPI?.ensureInputFocus;
    if (!ensureInputFocus) return;

    let lastRequest = 0;

    const requestFocusRecovery = () => {
      const now = Date.now();
      if (now - lastRequest < 250) return;
      lastRequest = now;
      void ensureInputFocus().catch(() => {
        /* Best effort: browser mode and transient Electron focus failures should not break input. */
      });
    };

    const handleEditableInteraction = (event: Event) => {
      if (!isEditableTarget(event.target)) return;
      if (document.activeElement === event.target) return;
      requestFocusRecovery();

      const target = event.target;
      window.setTimeout(() => {
        if (isEditableTarget(target) && document.activeElement !== target) {
          target.focus();
        }
      }, 0);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") requestFocusRecovery();
    };

    window.addEventListener("focus", requestFocusRecovery);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("focusin", handleEditableInteraction, true);
    document.addEventListener("pointerdown", handleEditableInteraction, true);

    return () => {
      window.removeEventListener("focus", requestFocusRecovery);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("focusin", handleEditableInteraction, true);
      document.removeEventListener("pointerdown", handleEditableInteraction, true);
    };
  }, []);
}
