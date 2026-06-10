import { useEffect, useRef } from "react";

interface ConfirmModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Modal title */
  title: string;
  /** Modal description/message — supports newlines via whitespace CSS */
  message: string;
  /** Label for the confirm button (default: "Confirmar") */
  confirmLabel?: string;
  /** Label for the cancel button (default: "Cancelar") */
  cancelLabel?: string;
  /** Called when the user confirms */
  onConfirm: () => void;
  /** Called when the user cancels */
  onCancel: () => void;
  /** Visual variant for the confirm button */
  variant?: "danger" | "primary";
}

/**
 * A styled React confirm modal that replaces native `window.confirm()`.
 *
 * Native OS dialogs steal focus from Electron's renderer on Windows,
 * which causes the caret/cursor to disappear from input fields.
 * This component keeps focus within the React DOM tree.
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  variant = "danger",
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the cancel button when the modal opens (safe default)
  useEffect(() => {
    if (open) {
      // Small delay so the DOM is painted before we steal focus
      const id = requestAnimationFrame(() => cancelRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBg =
    variant === "danger"
      ? "bg-red-500/90 hover:bg-red-500 text-white"
      : "text-black";
  const confirmStyle =
    variant === "primary"
      ? {
          backgroundImage:
            "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)",
        }
      : undefined;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 w-[90%] max-w-[420px] shadow-2xl text-center transform scale-100 transition-all duration-300">
        <h3 className="font-['Space_Grotesk',sans-serif] text-lg font-bold text-white mb-2 uppercase tracking-wide">
          {title}
        </h3>
        <p className="font-['Inter',sans-serif] text-sm text-gray-400 mb-6 leading-relaxed whitespace-pre-line">
          {message}
        </p>
        <div className="flex gap-4">
          <button
            ref={cancelRef}
            type="button"
            className="flex-1 py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold text-sm hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm active:scale-95 transition-all cursor-pointer border-none ${confirmBg}`}
            style={confirmStyle}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
