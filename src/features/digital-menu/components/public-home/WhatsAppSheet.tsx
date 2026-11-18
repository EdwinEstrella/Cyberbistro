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
      <div className="space-y-2.5">
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-full bg-[#59ee50] px-4 py-3 text-sm font-bold text-[#0a0a0a] shadow-md shadow-[#59ee50]/10 transition hover:bg-[#4ddb44] active:scale-95 cursor-pointer no-underline"
          >
            <MessageCircle className="size-4.5" />
            <span>Escribir por WhatsApp</span>
          </a>
        )}

        <button
          type="button"
          onClick={handleDownloadVCard}
          className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-full border border-[#262626] bg-[#1a1a1a] px-4 py-3 text-sm font-semibold text-[#fafafa] transition hover:bg-[#262626] active:scale-95 cursor-pointer"
        >
          <UserPlus className="size-4.5" />
          <span>Guardar contacto</span>
        </button>
      </div>
    </BottomSheet>
  );
}
