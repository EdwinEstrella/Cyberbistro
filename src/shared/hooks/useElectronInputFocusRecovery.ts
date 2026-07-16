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
      
      const hasFocus = document.hasFocus();
      const isActiveEditable = isEditableTarget(document.activeElement);
      if (isActiveEditable && hasFocus) return;

      requestFocusRecovery();
    };

    document.addEventListener("focusin", handleEditableInteraction, true);
    document.addEventListener("pointerdown", handleEditableInteraction, true);

    return () => {
      document.removeEventListener("focusin", handleEditableInteraction, true);
      document.removeEventListener("pointerdown", handleEditableInteraction, true);
    };
  }, []);
}
