import { MessageCircle, UserPlus } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { buildWhatsAppUrl, buildWhatsAppVCard } from "../../lib/contactLinks";

export interface WhatsAppSheetProps {
  isOpen: boolean;
  onClose: () => void;
  businessName: string;
  whatsapp: string;
}

export function WhatsAppSheet({
  isOpen,
  onClose,
  businessName,
  whatsapp,
}: WhatsAppSheetProps) {
  const waUrl = buildWhatsAppUrl(whatsapp);

  const handleDownloadVCard = () => {
    if (typeof document === "undefined") return;
    const vcardText = buildWhatsAppVCard(businessName, whatsapp);
    const blob = new Blob([vcardText], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const cleanFileName =
      businessName.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "") || "contacto";
    link.href = url;
    link.download = `${cleanFileName}.vcf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Contactanos por WhatsApp"
      description="Escribinos directamente o guardá nuestro contacto en tu teléfono."
    >
      <div className="space-y-3">
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[48px] w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 px-5 py-3.5 text-base font-black text-black shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-95 cursor-pointer no-underline"
          >
            <MessageCircle className="size-5" />
            <span>Escribir por WhatsApp</span>
          </a>
        )}

        <button
          type="button"
          onClick={handleDownloadVCard}
          className="flex min-h-[48px] w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-5 py-3.5 text-base font-black text-white transition hover:bg-white/[0.14] active:scale-95 cursor-pointer"
        >
          <UserPlus className="size-5 text-orange-300" />
          <span>Guardar contacto</span>
        </button>
      </div>
    </BottomSheet>
  );
}
