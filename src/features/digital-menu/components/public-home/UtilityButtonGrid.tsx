import { Gamepad2, MapPin, MessageCircle, Share2, Star, Wifi, type LucideIcon } from "lucide-react";
import type { UtilityAction, UtilityActionId } from "../../lib/contactLinks";

export interface UtilityButtonGridProps {
  actions: UtilityAction[];
  onActionClick: (action: UtilityAction) => void;
}

const ACTION_ICONS: Record<UtilityActionId, LucideIcon> = {
  games: Gamepad2,
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
      <div className="grid grid-cols-2 gap-2.5">
        {actions.map((action) => {
          const Icon = ACTION_ICONS[action.id] ?? Share2;

          if (action.type === "link" && action.url) {
            return (
              <a
                key={action.id}
                href={action.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-[#27272a] bg-[#111113] px-3.5 py-2.5 text-left transition hover:bg-[#18181b] hover:border-zinc-700 active:scale-98 cursor-pointer no-underline group"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 group-hover:bg-emerald-400/20 transition">
                  <Icon className="size-4.5" />
                </div>
                <span className="text-xs font-semibold leading-tight text-white group-hover:text-emerald-300 transition line-clamp-2">
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
              className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-[#27272a] bg-[#111113] px-3.5 py-2.5 text-left transition hover:bg-[#18181b] hover:border-zinc-700 active:scale-98 cursor-pointer group"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 group-hover:bg-emerald-400/20 transition">
                <Icon className="size-4.5" />
              </div>
              <span className="text-xs font-semibold leading-tight text-white group-hover:text-emerald-300 transition line-clamp-2">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
