import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { BottomSheet } from "./BottomSheet";

export interface WifiSheetProps {
  isOpen: boolean;
  onClose: () => void;
  wifiName: string;
  wifiPassword?: string | null;
}

export function WifiSheet({
  isOpen,
  onClose,
  wifiName,
  wifiPassword,
}: WifiSheetProps) {
  const [copiedField, setCopiedField] = useState<"name" | "password" | null>(null);

  const copyToClipboard = async (text: string, field: "name" | "password") => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== "undefined") {
        const input = document.createElement("input");
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    } catch {
      // Ignored if clipboard permissions denied
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Conectate al Wi-Fi"
      description="Copiá el nombre de red o la clave para conectarte rápidamente."
    >
      <div className="space-y-4">
        {/* Network Name (SSID) */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-200/60">
                Red Wi-Fi
              </span>
              <p className="mt-1 truncate text-base font-bold text-white">
                {wifiName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyToClipboard(wifiName, "name")}
              aria-label="Copiar nombre de red"
              className="flex size-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/10 text-orange-200 transition hover:bg-white/20 active:scale-95 cursor-pointer"
            >
              {copiedField === "name" ? (
                <Check className="size-5 text-emerald-400" />
              ) : (
                <Copy className="size-5" />
              )}
            </button>
          </div>
        </div>

        {/* Network Password */}
        {wifiPassword && wifiPassword.trim().length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-orange-200/60">
                  Contraseña
                </span>
                <p className="mt-1 font-mono text-base font-bold text-white tracking-wider">
                  {wifiPassword}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyToClipboard(wifiPassword, "password")}
                aria-label="Copiar contraseña"
                className="flex size-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/10 text-orange-200 transition hover:bg-white/20 active:scale-95 cursor-pointer"
              >
                {copiedField === "password" ? (
                  <Check className="size-5 text-emerald-400" />
                ) : (
                  <Copy className="size-5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Live region for accessibility feedback */}
        <div aria-live="polite" className="sr-only">
          {copiedField ? "Copiado al portapapeles" : ""}
        </div>

        {copiedField && (
          <p className="text-center text-xs font-bold text-emerald-400 animate-fade-in">
            ✓ Copiado al portapapeles
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
