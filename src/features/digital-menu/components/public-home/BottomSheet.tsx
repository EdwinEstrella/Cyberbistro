import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { publicMenuTheme } from "../public-app/publicMenuTheme";
import { useSheetDialog } from "../../hooks/useSheetDialog";

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
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useSheetDialog({
    isOpen,
    onClose,
    initialFocusRef: closeButtonRef,
  });

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
        className="relative z-10 w-full max-h-[88vh] overflow-y-auto rounded-t-[28px] border-t border-[#262626] bg-[#131313] p-5 text-[#fafafa] shadow-2xl transition-all pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:max-w-md sm:rounded-[20px] sm:border border-[#262626]"
      >
        {/* Mobile handle indicator */}
        <div className="mx-auto mb-3.5 h-1.5 w-10 rounded-full bg-[#3a3a3a] sm:hidden" />

        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 id="sheet-title" className={`text-base font-bold text-[#fafafa] ${publicMenuTheme.headingFontClass}`}>
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs text-[#adaaaa]">{description}</p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] border border-[#262626] text-[#adaaaa] hover:text-[#fafafa] transition cursor-pointer"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
