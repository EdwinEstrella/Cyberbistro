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
      <div className="space-y-3">
        {/* Network Name (SSID) */}
        <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Red Wi-Fi
              </span>
              <p className="mt-0.5 truncate text-sm font-bold text-white">
                {wifiName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyToClipboard(wifiName, "name")}
              aria-label="Copiar nombre de red"
              className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#27272a] bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 hover:text-white transition active:scale-95 cursor-pointer"
            >
              {copiedField === "name" ? (
                <>
                  <Check className="size-3.5 text-emerald-400" />
                  <span className="text-emerald-400">¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Network Password */}
        {wifiPassword && (
          <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Clave Wi-Fi
                </span>
                <p className="mt-0.5 font-mono text-sm font-bold tracking-wider text-emerald-400 truncate">
                  {wifiPassword}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyToClipboard(wifiPassword, "password")}
                aria-label="Copiar contraseña"
                className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#27272a] bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 hover:text-white transition active:scale-95 cursor-pointer"
              >
                {copiedField === "password" ? (
                  <>
                    <Check className="size-3.5 text-emerald-400" />
                    <span className="text-emerald-400">¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
