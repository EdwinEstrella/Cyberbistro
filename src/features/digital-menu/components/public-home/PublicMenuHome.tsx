import { useMemo, useState } from "react";
import { UtensilsCrossed, AlertTriangle } from "lucide-react";
import type { PublicMenuMode } from "../../lib/publicMenuMode";
import { getUtilityActions, type UtilityAction } from "../../lib/contactLinks";
import type { PublicContact } from "../../../menu-links/lib/publicMenuCalendar";
import { PartySizePicker } from "./PartySizePicker";
import { ServiceRequestPanel } from "./ServiceRequestPanel";
import { UtilityButtonGrid } from "./UtilityButtonGrid";
import { WifiSheet } from "./WifiSheet";
import { WhatsAppSheet } from "./WhatsAppSheet";
import { SocialSheet } from "./SocialSheet";
import { GamesSheet } from "../public-app/games/GamesSheet";
import { publicMenuTheme } from "../public-app/publicMenuTheme";

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
  slug?: string;
  tenantId?: string | null;
}

export function PublicMenuHome({
  mode,
  settings,
  contact,
  partySize,
  onPartySizeChange,
  onViewMenu,
  slug,
  tenantId,
}: PublicMenuHomeProps) {
  const [activeSheet, setActiveSheet] = useState<"games" | "wifi" | "whatsapp" | "social" | null>(null);

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
    <div className={publicMenuTheme.canvas} style={publicMenuTheme.rootStyle}>
      <div
        className={`${publicMenuTheme.deviceColumn} justify-between px-4 py-8 sm:px-6`}
        style={publicMenuTheme.rootStyle}
      >
        <main className="relative z-10 flex w-full max-w-sm mx-auto flex-1 flex-col items-center justify-center space-y-6">
          {/* Invalid mesa notice in takeout mode */}
          {mode.kind === "takeout" && mode.invalidMesa && (
            <div
              role="status"
              className="flex w-full items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-300 shadow-md"
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
                className="size-24 rounded-full object-contain bg-[#1a1a1a] border border-[#262626] p-2.5 shadow-xl"
              />
            ) : (
              <div
                aria-hidden="true"
                className={`flex size-24 items-center justify-center rounded-full border border-[#5b2a17] bg-[#2b160d] text-4xl font-black text-[#ff906d] shadow-xl ${publicMenuTheme.headingFontClass}`}
              >
                {initialLetter}
              </div>
            )}

            <h1 className={`mt-4 text-2xl font-bold tracking-tight text-[#fafafa] sm:text-3xl ${publicMenuTheme.headingFontClass}`}>
              {displayName}
            </h1>

            {settings.description && (
              <p className="mt-1.5 text-xs leading-relaxed text-[#adaaaa] sm:text-sm line-clamp-3">
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
              className={`flex min-h-[56px] w-full items-center justify-center gap-3 rounded-full px-6 py-4 text-sm font-bold transition cursor-pointer select-none shadow-sm ${
                isCtaDisabled
                  ? "bg-[#1a1a1a]/50 text-[#adaaaa]/40 border border-[#262626] cursor-not-allowed"
                  : "bg-[#ff906d] text-[#5b1600] hover:bg-[#ffb59c] active:scale-98 shadow-md"
              }`}
            >
              <UtensilsCrossed className="size-4.5" />
              <span>Ver menú y ordenar</span>
            </button>
            {isCtaDisabled && (
              <p className="mt-2 text-center text-[11px] font-medium text-[#adaaaa]">
                Elegí la cantidad de personas para continuar
              </p>
            )}
          </div>

          {/* In-table service requests (Call waiter & Ask for the bill) */}
          {isTableMode && slug && tenantId && (
            <div className="w-full pt-1">
              <ServiceRequestPanel
                slug={slug}
                mesa={mode.mesa}
                tenantId={tenantId}
              />
            </div>
          )}

          {/* Utility button grid */}
          {actions.length > 0 && (
            <div className="w-full pt-1">
              <UtilityButtonGrid actions={actions} onActionClick={handleActionClick} />
            </div>
          )}
        </main>

        {/* Footer: Table number pinned at bottom in table mode */}
        {isTableMode && (
          <footer className="relative z-10 mt-6 w-full max-w-sm mx-auto text-center pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#5b2a17] bg-[#2b160d] px-4 py-1.5 text-xs font-semibold text-[#ffb59c]">
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

        <GamesSheet
          isOpen={activeSheet === "games"}
          onClose={() => setActiveSheet(null)}
        />
      </div>
    </div>
  );
}
