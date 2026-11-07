import { ExternalLink, QrCode, Copy, Check } from "lucide-react";

export interface PublicMenuShareSectionProps {
  qrCodeDataUrl: string;
  qrUrl: string;
  copiedLink: boolean;
  onCopyLink: () => void;
  onDownloadQR: () => void;
}

export function PublicMenuShareSection({
  qrCodeDataUrl,
  qrUrl,
  copiedLink,
  onCopyLink,
  onDownloadQR,
}: PublicMenuShareSectionProps) {
  return (
    <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex flex-col items-center text-center gap-3">
      <h3 className="font-['Space_Grotesk'] text-sm font-bold text-foreground self-start">
        Código QR y Enlace Público
      </h3>

      {qrCodeDataUrl ? (
        <div className="bg-white p-3 rounded-2xl border border-black/10 flex items-center justify-center shadow-inner my-1">
          <img src={qrCodeDataUrl} alt="Código QR del Menú" className="w-40 h-40 object-contain" />
        </div>
      ) : (
        <div className="w-40 h-40 rounded-2xl bg-muted animate-pulse flex items-center justify-center text-xs text-muted-foreground">
          Generando QR...
        </div>
      )}

      <div className="flex flex-col gap-1 w-full text-center">
        <span className="text-xs font-semibold text-primary break-all font-mono">
          {qrUrl}
        </span>
        <p className="text-[11px] text-muted-foreground">
          Escanea o comparte este enlace para acceder directamente al menú público.
        </p>
      </div>

      <div className="flex gap-2 w-full mt-1">
        <button
          type="button"
          onClick={onCopyLink}
          className="flex-1 flex items-center justify-center gap-1.5 bg-muted hover:bg-muted/80 text-foreground py-2 px-3 rounded-xl font-bold text-xs border border-border cursor-pointer transition-colors"
        >
          {copiedLink ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
          Copiar Enlace
        </button>
        <button
          type="button"
          onClick={onDownloadQR}
          className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground py-2 px-3 rounded-xl font-bold text-xs cursor-pointer hover:opacity-90 transition-all shadow-sm"
        >
          <QrCode className="size-3.5" />
          Descargar QR
        </button>
      </div>

      <a
        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
          `¡Hola! Acá te comparto nuestro menú digital:\n${qrUrl}`
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-2 bg-[#25D366]/10 text-[#25D366] font-bold py-2 rounded-xl hover:bg-[#25D366]/20 transition-colors cursor-pointer text-xs mt-1"
      >
        <ExternalLink className="size-3.5" />
        Compartir Menú por WhatsApp
      </a>
    </div>
  );
}
