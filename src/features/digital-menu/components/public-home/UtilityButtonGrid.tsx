import { MapPin, MessageCircle, Share2, Star, Wifi, type LucideIcon } from "lucide-react";
import type { UtilityAction, UtilityActionId } from "../../lib/contactLinks";

export interface UtilityButtonGridProps {
  actions: UtilityAction[];
  onActionClick: (action: UtilityAction) => void;
}

const ACTION_ICONS: Record<UtilityActionId, LucideIcon> = {
  wifi: Wifi,
  whatsapp: MessageCircle,
  social: Share2,
  google_review: Star,
  maps: MapPin,
};

export function UtilityButtonGrid({
  actions,
  onActionClick,
}: UtilityButtonGridProps) {
  if (actions.length === 0) return null;

  return (
    <section aria-label="Accesos rápidos" className="w-full">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {actions.map((action) => {
          const Icon = ACTION_ICONS[action.id] ?? Share2;

          if (action.type === "link" && action.url) {
            return (
              <a
                key={action.id}
                href={action.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-left transition hover:bg-white/[0.12] hover:border-white/20 active:scale-98 cursor-pointer no-underline group"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-400/15 text-orange-300 group-hover:bg-orange-400/25 transition">
                  <Icon className="size-4.5" />
                </div>
                <span className="text-xs font-bold leading-tight text-white/90 line-clamp-2">
                  {action.label}
                </span>
              </a>
            );
          }

          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onActionClick(action)}
              className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-left transition hover:bg-white/[0.12] hover:border-white/20 active:scale-98 cursor-pointer group"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-400/15 text-orange-300 group-hover:bg-orange-400/25 transition">
                <Icon className="size-4.5" />
              </div>
              <span className="text-xs font-bold leading-tight text-white/90 line-clamp-2">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
