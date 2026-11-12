import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { publicMenuTheme } from "../public-app/publicMenuTheme";

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
}: BottomSheetProps) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      closeButtonRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus?.();
      previousFocusRef.current = null;
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-title"
      style={publicMenuTheme.rootStyle}
      className={`fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 ${publicMenuTheme.fontClass}`}
    >
      {/* Backdrop */}
      <div
        data-testid="bottom-sheet-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Sheet panel */}
      <div
        style={publicMenuTheme.rootStyle}
        className="relative z-10 w-full max-h-[88vh] overflow-y-auto rounded-t-[28px] border-t border-[#27272a] bg-[#111113] p-5 text-zinc-100 shadow-2xl transition-all pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:max-w-md sm:rounded-2xl sm:border border-[#27272a]"
      >
        {/* Mobile handle indicator */}
        <div className="mx-auto mb-3.5 h-1.5 w-10 rounded-full bg-zinc-700 sm:hidden" />

        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 id="sheet-title" className="text-base font-bold text-white">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs text-zinc-400">{description}</p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#18181b] border border-[#27272a] text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
