import { useState, useEffect, useMemo, useCallback } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { buildTableMenuUrl } from "../../menu-links/lib/menuLinkUrl";

export interface TableQrItem {
  mesa: number;
  url: string;
  dataUrl: string;
  loading: boolean;
}

export interface UsePublicMenuTableQrsParams {
  slug: string;
  tableCount: number;
  businessName?: string;
}

export function getTableQrFileName(mesa: number, slug: string): string {
  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "") || "menu";
  return `qr-mesa-${mesa}-${cleanSlug}.png`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildTableQrPrintHtml(
  items: Array<{ mesa: number; dataUrl: string; url: string }>,
  businessName: string
): string {
  const chunks: Array<Array<{ mesa: number; dataUrl: string; url: string }>> = [];
  for (let i = 0; i < items.length; i += 6) {
    chunks.push(items.slice(i, i + 6));
  }

  const pagesHtml = chunks
    .map(
      (chunk) => `
    <div class="sheet">
      ${chunk
        .map(
          (item) => `
        <div class="qr-card">
          ${businessName ? `<div class="business-name">${escapeHtml(businessName)}</div>` : ""}
          <div class="mesa-title">Mesa ${item.mesa}</div>
          <img class="qr-img" src="${item.dataUrl}" alt="QR Mesa ${item.mesa}" />
          <div class="qr-note">Escaneá para ver el menú y pedir</div>
        </div>
      `
        )
        .join("")}
    </div>
  `
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Códigos QR - ${escapeHtml(businessName || "Mesas")}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111;
      background: #fff;
    }
    .sheet {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      grid-template-rows: repeat(3, 1fr);
      gap: 8mm;
      height: 277mm;
      page-break-after: always;
      break-after: page;
      padding: 4mm;
    }
    .sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .qr-card {
      border: 2px dashed #999;
      border-radius: 12px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .business-name {
      font-size: 13px;
      font-weight: 600;
      color: #444;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
      max-width: 90%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mesa-title {
      font-size: 24px;
      font-weight: 800;
      color: #000;
      margin-bottom: 8px;
    }
    .qr-img {
      width: 140px;
      height: 140px;
      display: block;
      margin: 0 auto;
    }
    .qr-note {
      font-size: 10px;
      color: #666;
      margin-top: 6px;
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;
}

export function printHtmlViaHiddenIframe(html: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "-9999px";
  iframe.style.width = "420px";
  iframe.style.height = "600px";
  iframe.style.border = "none";
  iframe.style.opacity = "0";

  let cleaned = false;
  let printed = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => {
      try {
        iframe.remove();
      } catch {}
    }, 1000);
  };

  iframe.onload = () => {
    if (printed) return;
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    printed = true;
    iframe.onload = null;

    setTimeout(() => {
      try {
        win.focus();
        win.addEventListener("afterprint", cleanup, { once: true });
        win.print();
        setTimeout(cleanup, 60000);
      } catch (err) {
        console.warn("printTableQr: fallo al imprimir en el navegador", err);
        cleanup();
      }
    }, 150);
  };

  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

export function usePublicMenuTableQrs({
  slug,
  tableCount,
  businessName = "",
}: UsePublicMenuTableQrsParams) {
  const [isOpen, setIsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [qrMap, setQrMap] = useState<Record<number, string>>({});

  const resolvedSlug = useMemo(
    () => slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, ""),
    [slug]
  );

  const safeTableCount = Math.max(0, Math.floor(tableCount || 0));

  // Lazily generate QR codes only when isOpen is true and safeTableCount > 0
  useEffect(() => {
    if (!isOpen || !resolvedSlug || safeTableCount <= 0) {
      return;
    }

    let isCancelled = false;
    setGenerating(true);

    const generateAll = async () => {
      try {
        const entries = await Promise.all(
          Array.from({ length: safeTableCount }, async (_, idx) => {
            const mesa = idx + 1;
            const url = buildTableMenuUrl(resolvedSlug, mesa);
            const dataUrl = await QRCode.toDataURL(url, { width: 256, margin: 2 });
            return [mesa, dataUrl] as const;
          })
        );

        if (!isCancelled) {
          const map: Record<number, string> = {};
          for (const [m, d] of entries) {
            map[m] = d;
          }
          setQrMap(map);
        }
      } catch (err) {
        console.error("Error generating table QRs:", err);
        if (!isCancelled) {
          toast.error("No se pudieron generar todos los códigos QR de las mesas.");
        }
      } finally {
        if (!isCancelled) {
          setGenerating(false);
        }
      }
    };

    void generateAll();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, resolvedSlug, safeTableCount]);

  const items: TableQrItem[] = useMemo(() => {
    if (safeTableCount <= 0) return [];
    return Array.from({ length: safeTableCount }, (_, idx) => {
      const mesa = idx + 1;
      const url = buildTableMenuUrl(resolvedSlug, mesa);
      const dataUrl = qrMap[mesa] || "";
      return {
        mesa,
        url,
        dataUrl,
        loading: generating && !dataUrl,
      };
    });
  }, [safeTableCount, resolvedSlug, qrMap, generating]);

  const handleToggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleDownloadTableQr = useCallback(
    (mesa: number) => {
      const dataUrl = qrMap[mesa];
      if (!dataUrl) {
        toast.error(`El QR de la mesa ${mesa} aún no está listo.`);
        return;
      }
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = getTableQrFileName(mesa, resolvedSlug);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [qrMap, resolvedSlug]
  );

  const handlePrintAll = useCallback(() => {
    if (safeTableCount <= 0) return;
    if (generating) {
      toast.error("Esperá un momento mientras se terminan de generar los QR.");
      return;
    }

    const printItems = items.filter((it) => Boolean(it.dataUrl));
    if (printItems.length === 0) {
      toast.error("No hay códigos QR listos para imprimir.");
      return;
    }

    const html = buildTableQrPrintHtml(printItems, businessName);
    printHtmlViaHiddenIframe(html);
  }, [safeTableCount, generating, items, businessName]);

  return {
    isOpen,
    setIsOpen,
    handleToggleOpen,
    generating,
    items,
    qrMap,
    handleDownloadTableQr,
    handlePrintAll,
  };
}
