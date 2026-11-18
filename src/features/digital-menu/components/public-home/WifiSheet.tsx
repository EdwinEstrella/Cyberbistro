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
        <div className="rounded-[18px] border border-[#262626] bg-[#1a1a1a] p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#adaaaa]">
                Red Wi-Fi
              </span>
              <p className="mt-0.5 truncate text-sm font-bold text-[#fafafa]">
                {wifiName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyToClipboard(wifiName, "name")}
              aria-label="Copiar nombre de red"
              className="flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#262626] bg-[#131313] px-3.5 py-1.5 text-xs font-semibold text-[#fafafa] hover:bg-[#262626] transition active:scale-95 cursor-pointer"
            >
              {copiedField === "name" ? (
                <>
                  <Check className="size-3.5 text-[#59ee50]" />
                  <span className="text-[#59ee50]">¡Copiado!</span>
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
          <div className="rounded-[18px] border border-[#262626] bg-[#1a1a1a] p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#adaaaa]">
                  Clave Wi-Fi
                </span>
                <p className="mt-0.5 font-mono text-sm font-bold tracking-wider text-[#ff906d] truncate">
                  {wifiPassword}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyToClipboard(wifiPassword, "password")}
                aria-label="Copiar contraseña"
                className="flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#262626] bg-[#131313] px-3.5 py-1.5 text-xs font-semibold text-[#fafafa] hover:bg-[#262626] transition active:scale-95 cursor-pointer"
              >
                {copiedField === "password" ? (
                  <>
                    <Check className="size-3.5 text-[#59ee50]" />
                    <span className="text-[#59ee50]">¡Copiado!</span>
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
