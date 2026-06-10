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
    let lastActiveInput: HTMLElement | null = null;

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
      
      lastActiveInput = event.target;
      
      const hasFocus = document.hasFocus();
      const isActiveEditable = isEditableTarget(document.activeElement);
      if (isActiveEditable && hasFocus) return;

      requestFocusRecovery();

      const target = event.target;
      window.setTimeout(() => {
        if (isEditableTarget(target) && document.activeElement !== target) {
          target.focus();
        }
      }, 0);
    };

    const handleWindowFocus = () => {
      requestFocusRecovery();
      if (lastActiveInput && document.body.contains(lastActiveInput) && document.activeElement !== lastActiveInput) {
        window.setTimeout(() => {
          if (lastActiveInput && document.body.contains(lastActiveInput) && isEditableTarget(lastActiveInput)) {
            console.log("[useElectronInputFocusRecovery] restoring focus to last active input:", lastActiveInput.id);
            lastActiveInput.focus();
          }
        }, 50);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") requestFocusRecovery();
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("focusin", handleEditableInteraction, true);
    document.addEventListener("pointerdown", handleEditableInteraction, true);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("focusin", handleEditableInteraction, true);
      document.removeEventListener("pointerdown", handleEditableInteraction, true);
    };
  }, []);
}
