import { useEffect, useRef, type RefObject } from "react";

export interface UseSheetDialogOptions {
  isOpen: boolean;
  onClose: () => void;
  initialFocusRef: RefObject<HTMLElement | null>;
}

export function useSheetDialog({
  isOpen,
  onClose,
  initialFocusRef,
}: UseSheetDialogOptions) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined" || !document.body || !isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    initialFocusRef.current?.focus?.();

    const originalOverflow = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation?.();
        onCloseRef.current();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      if (previousFocusRef.current) {
        previousFocusRef.current.focus?.();
        previousFocusRef.current = null;
      }
    };
  }, [isOpen]);
}
