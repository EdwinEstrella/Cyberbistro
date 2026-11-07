import { useState, useEffect, useMemo } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { buildPublicMenuUrl } from "../../menu-links/lib/menuLinkUrl";

export interface UsePublicMenuShareParams {
  slug: string;
}

export function usePublicMenuShare({ slug }: UsePublicMenuShareParams) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");

  const resolvedSlug = useMemo(
    () => slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, ""),
    [slug]
  );

  const qrUrl = useMemo(
    () => buildPublicMenuUrl(resolvedSlug),
    [resolvedSlug]
  );

  useEffect(() => {
    if (!qrUrl) return;
    QRCode.toDataURL(qrUrl, { width: 256, margin: 2 })
      .then((url: string) => setQrCodeDataUrl(url))
      .catch((err: unknown) => console.error("Error generating QR:", err));
  }, [qrUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopiedLink(true);
      toast.success("Enlace público copiado al portapapeles");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  const handleDownloadQR = () => {
    if (!qrCodeDataUrl) return;
    const link = document.createElement("a");
    link.href = qrCodeDataUrl;
    link.download = `qr-menu-${resolvedSlug || "azokia"}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return {
    resolvedSlug,
    qrUrl,
    qrCodeDataUrl,
    copiedLink,
    handleCopyLink,
    handleDownloadQR,
  };
}
