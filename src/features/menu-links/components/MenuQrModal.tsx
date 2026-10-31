import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, Download, X } from "lucide-react";
import { toast } from "sonner";

interface MenuQrModalProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
}

export function MenuQrModal({ open, onClose, url, title }: MenuQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !url) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(url, { width: 320, margin: 2 })
      .then((dataUrl: string) => setQrDataUrl(dataUrl))
      .catch((err: unknown) => {
        console.error("Error al generar código QR:", err);
      });
  }, [open, url]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado al portapapeles");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `qr-${title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.png`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl p-6 flex flex-col items-center gap-5 text-card-foreground">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Cerrar"
        >
          <X className="size-5" />
        </button>

        <div className="text-center">
          <h3 className="text-lg font-bold font-['Space_Grotesk'] text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1">Escanea para acceder al menú digital</p>
        </div>

        <div className="p-4 bg-white rounded-xl shadow-inner border border-black/5 flex items-center justify-center">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR ${title}`} className="size-56 object-contain rounded-lg" />
          ) : (
            <div className="size-56 flex items-center justify-center text-xs text-muted-foreground">
              Generando QR...
            </div>
          )}
        </div>

        <div className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-muted/60 border border-border text-xs break-all">
          <span className="flex-1 font-mono text-[11px] truncate text-foreground/80">{url}</span>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg bg-card border border-border hover:bg-accent text-foreground transition-colors cursor-pointer shrink-0"
            title="Copiar enlace"
          >
            {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
          </button>
        </div>

        <div className="w-full flex gap-3">
          <button
            onClick={handleDownload}
            disabled={!qrDataUrl}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-xs uppercase tracking-wider hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer shadow-md"
          >
            <Download className="size-4" />
            Descargar QR
          </button>
          <button
            onClick={onClose}
            className="py-2.5 px-5 rounded-xl bg-muted text-muted-foreground font-semibold text-xs uppercase tracking-wider hover:text-foreground transition-colors cursor-pointer border border-border"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
