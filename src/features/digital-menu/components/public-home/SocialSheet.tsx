import { ExternalLink, Instagram, Facebook, Video } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { buildSocialUrl, sanitizeHttpsUrl } from "../../lib/contactLinks";
import type { PublicContact } from "../../../menu-links/lib/publicMenuCalendar";

export interface SocialSheetProps {
  isOpen: boolean;
  onClose: () => void;
  contact?: PublicContact | null;
}

interface SocialItem {
  key: string;
  label: string;
  url: string;
  icon: typeof Instagram;
  colorClass: string;
}

export function SocialSheet({ isOpen, onClose, contact }: SocialSheetProps) {
  const items: SocialItem[] = [];

  const instagramUrl = sanitizeHttpsUrl(buildSocialUrl("instagram", contact?.instagram));
  if (instagramUrl) {
    items.push({
      key: "instagram",
      label: "Instagram",
      url: instagramUrl,
      icon: Instagram,
      colorClass: "hover:border-pink-500/50 hover:bg-pink-500/10 text-pink-400",
    });
  }

  const facebookUrl = sanitizeHttpsUrl(buildSocialUrl("facebook", contact?.facebook));
  if (facebookUrl) {
    items.push({
      key: "facebook",
      label: "Facebook",
      url: facebookUrl,
      icon: Facebook,
      colorClass: "hover:border-blue-500/50 hover:bg-blue-500/10 text-blue-400",
    });
  }

  const tiktokUrl = sanitizeHttpsUrl(buildSocialUrl("tiktok", contact?.tiktok));
  if (tiktokUrl) {
    items.push({
      key: "tiktok",
      label: "TikTok",
      url: tiktokUrl,
      icon: Video,
      colorClass: "hover:border-cyan-500/50 hover:bg-cyan-500/10 text-cyan-300",
    });
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Nuestras redes sociales"
      description="Seguinos para enterarte de novedades, promociones y eventos."
    >
      <div className="space-y-2.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.key}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex min-h-[48px] items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3.5 transition active:scale-95 no-underline ${item.colorClass}`}
            >
              <div className="flex items-center gap-3.5">
                <Icon className="size-5" />
                <span className="text-base font-bold text-white">{item.label}</span>
              </div>
              <ExternalLink className="size-4 opacity-50" />
            </a>
          );
        })}
      </div>
    </BottomSheet>
  );
}
