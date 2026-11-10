import { useMemo, useState } from "react";
import { UtensilsCrossed, AlertTriangle } from "lucide-react";
import type { PublicMenuMode } from "../../lib/publicMenuMode";
import { getUtilityActions, type UtilityAction } from "../../lib/contactLinks";
import type { PublicContact } from "../../../menu-links/lib/publicMenuCalendar";
import { PartySizePicker } from "./PartySizePicker";
import { UtilityButtonGrid } from "./UtilityButtonGrid";
import { WifiSheet } from "./WifiSheet";
import { WhatsAppSheet } from "./WhatsAppSheet";
import { SocialSheet } from "./SocialSheet";

export interface PublicMenuHomeSettings {
  title: string;
  business_name: string;
  description: string | null;
  logo_url: string | null;
}

export interface PublicMenuHomeProps {
  mode: PublicMenuMode;
  settings: PublicMenuHomeSettings;
  contact?: PublicContact | null;
  partySize: number | null;
  onPartySizeChange: (size: number) => void;
  onViewMenu: () => void;
}

export function PublicMenuHome({
  mode,
  settings,
  contact,
  partySize,
  onPartySizeChange,
  onViewMenu,
}: PublicMenuHomeProps) {
  const [activeSheet, setActiveSheet] = useState<"wifi" | "whatsapp" | "social" | null>(null);

  const isTableMode = mode.kind === "table";
  const actions = useMemo(
    () => getUtilityActions(contact, isTableMode ? "table" : "takeout"),
    [contact, isTableMode]
  );

  const displayName = settings.title || settings.business_name || "Menú Digital";
  const initialLetter = displayName.trim().charAt(0).toUpperCase() || "R";

  const handleActionClick = (action: UtilityAction) => {
    if (action.type === "sheet" && action.sheet) {
      setActiveSheet(action.sheet);
    }
  };

  const isCtaDisabled = isTableMode && partySize === null;

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-between overflow-x-hidden bg-[#15100c] text-[#fff7ed] px-4 py-8 sm:px-6">
      {/* Background glow decoration */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, #ff906d 0, transparent 40%), radial-gradient(circle at 80% 40%, #facc15 0, transparent 30%)",
        }}
        aria-hidden="true"
      />

      <main className="relative z-10 flex w-full max-w-sm flex-1 flex-col items-center justify-center space-y-6">
        {/* Invalid mesa notice in takeout mode */}
        {mode.kind === "takeout" && mode.invalidMesa && (
          <div
            role="status"
            className="flex w-full items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 shadow-md"
          >
            <AlertTriangle className="size-5 shrink-0 text-amber-400" />
            <span>El QR de esta mesa no es válido; podés pedir para llevar.</span>
          </div>
        )}

        {/* Top: Logo, Restaurant Name, Description */}
        <header className="flex flex-col items-center text-center">
          {settings.logo_url ? (
            <img
              src={settings.logo_url}
              alt={`Logo de ${displayName}`}
              className="size-24 rounded-3xl object-contain bg-white/10 p-2.5 shadow-xl border border-white/10"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex size-24 items-center justify-center rounded-3xl border border-orange-400/30 bg-orange-500/20 text-4xl font-black text-orange-200 shadow-xl"
            >
              {initialLetter}
            </div>
          )}

          <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
            {displayName}
          </h1>

          {settings.description && (
            <p className="mt-1.5 text-xs leading-relaxed text-orange-100/70 sm:text-sm line-clamp-3">
              {settings.description}
            </p>
          )}
        </header>

        {/* Middle: Party size picker (table mode only) */}
        {isTableMode && (
          <div className="w-full">
            <PartySizePicker value={partySize} onChange={onPartySizeChange} />
          </div>
        )}

        {/* Main CTA: Ver menú y ordenar */}
        <div className="w-full pt-1">
          <button
            type="button"
            onClick={onViewMenu}
            disabled={isCtaDisabled}
            aria-disabled={isCtaDisabled}
            className={`flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-base font-black uppercase tracking-wider transition cursor-pointer select-none shadow-xl ${
              isCtaDisabled
                ? "bg-white/10 text-white/40 cursor-not-allowed border border-white/5"
                : "bg-[#ff906d] text-[#24120b] shadow-orange-500/30 hover:bg-[#ff9f80] active:scale-98"
            }`}
          >
            <UtensilsCrossed className="size-5" />
            <span>Ver menú y ordenar</span>
          </button>
          {isCtaDisabled && (
            <p className="mt-2 text-center text-[11px] font-medium text-orange-200/60">
              Elegí la cantidad de personas para continuar
            </p>
          )}
        </div>

        {/* Utility button grid */}
        {actions.length > 0 && (
          <div className="w-full pt-2">
            <UtilityButtonGrid actions={actions} onActionClick={handleActionClick} />
          </div>
        )}
      </main>

      {/* Footer: Table number pinned at bottom in table mode */}
      {isTableMode && (
        <footer className="relative z-10 mt-6 w-full max-w-sm text-center pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/10 px-4 py-1.5 text-xs font-black text-orange-200">
            <span>🪑 Mesa {mode.mesa}</span>
          </div>
        </footer>
      )}

      {/* Bottom sheets */}
      {contact?.wifi_name && (
        <WifiSheet
          isOpen={activeSheet === "wifi"}
          onClose={() => setActiveSheet(null)}
          wifiName={contact.wifi_name}
          wifiPassword={contact.wifi_password}
        />
      )}

      {contact?.whatsapp && (
        <WhatsAppSheet
          isOpen={activeSheet === "whatsapp"}
          onClose={() => setActiveSheet(null)}
          businessName={displayName}
          whatsapp={contact.whatsapp}
        />
      )}

      <SocialSheet
        isOpen={activeSheet === "social"}
        onClose={() => setActiveSheet(null)}
        contact={contact}
      />
    </div>
  );
}
