import { useState, useMemo } from "react";
import {
  Gamepad2,
  MapPin,
  MessageCircle,
  Share2,
  Star,
  Wifi,
  type LucideIcon,
  Sparkles,
} from "lucide-react";
import {
  getUtilityActions,
  type UtilityAction,
  type UtilityActionId,
} from "../../lib/contactLinks";
import type { PublicContact } from "../../../menu-links/lib/publicMenuCalendar";
import { WifiSheet } from "../public-home/WifiSheet";
import { WhatsAppSheet } from "../public-home/WhatsAppSheet";
import { SocialSheet } from "../public-home/SocialSheet";
import { ServiceRequestPanel } from "../public-home/ServiceRequestPanel";
import { GamesSheet } from "./games/GamesSheet";
import { publicMenuTheme } from "./publicMenuTheme";

export interface ServicesTabProps {
  contact?: PublicContact | null;
  isTableMode: boolean;
  businessName: string;
  slug?: string;
  tenantId?: string | null;
  mesa?: number | null;
}

const ACTION_ICONS: Record<UtilityActionId, LucideIcon> = {
  games: Gamepad2,
  wifi: Wifi,
  whatsapp: MessageCircle,
  social: Share2,
  google_review: Star,
  maps: MapPin,
};

export function ServicesTab({
  contact,
  isTableMode,
  businessName,
  slug,
  tenantId,
  mesa,
}: ServicesTabProps) {
  const [activeSheet, setActiveSheet] = useState<"games" | "wifi" | "whatsapp" | "social" | null>(null);

  const actions = useMemo(
    () => getUtilityActions(contact, isTableMode ? "table" : "takeout"),
    [contact, isTableMode]
  );

  const handleActionClick = (action: UtilityAction) => {
    if (action.type === "sheet" && action.sheet) {
      setActiveSheet(action.sheet);
    }
  };

  return (
    <div className="w-full px-4 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-full bg-[#2b160d] border border-[#5b2a17] text-[#ff906d] flex items-center justify-center shrink-0">
          <Sparkles className="size-4.5" />
        </div>
        <div>
          <h2 className={`text-base font-bold text-[#fafafa] ${publicMenuTheme.headingFontClass}`}>
            {isTableMode ? "Servicios y Utilidades" : "Información y Contacto"}
          </h2>
          <p className="text-xs text-[#adaaaa]">
            {isTableMode
              ? "Todo lo que necesitás durante tu visita"
              : "Canales de contacto y ubicación"}
          </p>
        </div>
      </div>

      {/* Table service requests (Call waiter / Ask for bill) */}
      {isTableMode && slug && tenantId && mesa && (
        <div className="w-full">
          <ServiceRequestPanel slug={slug} mesa={mesa} tenantId={tenantId} />
        </div>
      )}

      {/* Grid of utility cards */}
      {actions.length === 0 ? (
        <div className="rounded-[20px] border border-[#262626] bg-[#131313] p-8 text-center text-xs text-[#adaaaa]">
          No hay servicios adicionales configurados.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {actions.map((action) => {
            const Icon = ACTION_ICONS[action.id] ?? Share2;

            if (action.type === "link" && action.url) {
              return (
                <a
                  key={action.id}
                  href={action.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[56px] items-center gap-3.5 rounded-[18px] border border-[#262626] bg-[#131313] p-3 text-left transition hover:bg-[#1a1a1a] hover:border-[#3a3a3a] active:scale-98 cursor-pointer no-underline group"
                >
                  <div className="size-10 rounded-full bg-[#2b160d] border border-[#5b2a17] text-[#ff906d] flex items-center justify-center shrink-0 group-hover:bg-[#5b2a17]/50 transition">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-[#fafafa] group-hover:text-[#ffb59c] transition">
                      {action.label}
                    </span>
                    <span className="text-[11px] text-[#adaaaa] truncate block">Abrir enlace externo</span>
                  </div>
                </a>
              );
            }

            return (
              <button
                key={action.id}
                type="button"
                onClick={() => handleActionClick(action)}
                className="flex min-h-[56px] items-center gap-3.5 rounded-[18px] border border-[#262626] bg-[#131313] p-3 text-left transition hover:bg-[#1a1a1a] hover:border-[#3a3a3a] active:scale-98 cursor-pointer group"
              >
                <div className="size-10 rounded-full bg-[#2b160d] border border-[#5b2a17] text-[#ff906d] flex items-center justify-center shrink-0 group-hover:bg-[#5b2a17]/50 transition">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-[#fafafa] group-hover:text-[#ffb59c] transition">
                    {action.label}
                  </span>
                  <span className="text-[11px] text-[#adaaaa] truncate block">Tocar para ver opciones</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Sheets */}
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
          businessName={businessName}
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
  );
}
