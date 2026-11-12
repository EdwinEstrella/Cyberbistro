import { useState, useMemo } from "react";
import {
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

export interface ServicesTabProps {
  contact?: PublicContact | null;
  isTableMode: boolean;
  businessName: string;
}

const ACTION_ICONS: Record<UtilityActionId, LucideIcon> = {
  wifi: Wifi,
  whatsapp: MessageCircle,
  social: Share2,
  google_review: Star,
  maps: MapPin,
};

export function ServicesTab({ contact, isTableMode, businessName }: ServicesTabProps) {
  const [activeSheet, setActiveSheet] = useState<"wifi" | "whatsapp" | "social" | null>(null);

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
        <div className="size-9 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 flex items-center justify-center shrink-0">
          <Sparkles className="size-4.5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">
            {isTableMode ? "Servicios y Utilidades" : "Información y Contacto"}
          </h2>
          <p className="text-xs text-zinc-400">
            {isTableMode
              ? "Todo lo que necesitás durante tu visita"
              : "Canales de contacto y ubicación"}
          </p>
        </div>
      </div>

      {/* Grid of utility cards */}
      {actions.length === 0 ? (
        <div className="rounded-2xl border border-[#27272a] bg-[#111113] p-8 text-center text-xs text-zinc-500">
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
                  className="flex min-h-[56px] items-center gap-3.5 rounded-2xl border border-[#27272a] bg-[#111113] p-3 text-left transition hover:bg-[#18181b] hover:border-zinc-700 active:scale-98 cursor-pointer no-underline group"
                >
                  <div className="size-10 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:bg-emerald-400/20 transition">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-white group-hover:text-emerald-300 transition">
                      {action.label}
                    </span>
                    <span className="text-[11px] text-zinc-500 truncate block">Abrir enlace externo</span>
                  </div>
                </a>
              );
            }

            return (
              <button
                key={action.id}
                type="button"
                onClick={() => handleActionClick(action)}
                className="flex min-h-[56px] items-center gap-3.5 rounded-2xl border border-[#27272a] bg-[#111113] p-3 text-left transition hover:bg-[#18181b] hover:border-zinc-700 active:scale-98 cursor-pointer group"
              >
                <div className="size-10 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:bg-emerald-400/20 transition">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-white group-hover:text-emerald-300 transition">
                    {action.label}
                  </span>
                  <span className="text-[11px] text-zinc-500 truncate block">Tocar para ver opciones</span>
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
    </div>
  );
}
