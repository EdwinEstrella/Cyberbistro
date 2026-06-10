import { useEffect, useRef } from "react";

interface AlertModalProps {
  open: boolean;
  title: string;
  message: string;
  buttonLabel?: string;
  onClose: () => void;
  variant?: "danger" | "primary" | "info";
}

/**
 * A styled React alert modal that replaces native `window.alert()`.
 * Keeps focus in the React DOM tree to prevent Electron focus loss.
 */
export function AlertModal({
  open,
  title,
  message,
  buttonLabel = "Aceptar",
  onClose,
  variant = "info",
}: AlertModalProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => btnRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const btnBg =
    variant === "danger"
      ? "bg-red-500/90 hover:bg-red-500 text-white"
      : variant === "primary"
      ? "text-black"
      : "bg-[#262626] hover:bg-[#333] text-white";

  const btnStyle =
    variant === "primary"
      ? {
          backgroundImage:
            "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)",
        }
      : undefined;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 w-[90%] max-w-[420px] shadow-2xl text-center transform scale-100 transition-all duration-300">
        <h3 className="font-['Space_Grotesk',sans-serif] text-lg font-bold text-white mb-2 uppercase tracking-wide">
          {title}
        </h3>
        <p className="font-['Inter',sans-serif] text-sm text-gray-400 mb-6 leading-relaxed whitespace-pre-line">
          {message}
        </p>
        <button
          ref={btnRef}
          type="button"
          className={`w-full py-3 px-4 rounded-xl font-bold text-sm active:scale-95 transition-all cursor-pointer border-none ${btnBg}`}
          style={btnStyle}
          onClick={onClose}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
