import {
  QrCode,
  Printer,
  Download,
  ChevronDown,
  ChevronUp,
  Info,
  RefreshCw,
} from "lucide-react";
import type { TableQrItem } from "../../hooks/usePublicMenuTableQrs";

export interface PublicMenuTableQrSectionProps {
  tableCount: number;
  items: TableQrItem[];
  isOpen: boolean;
  onToggleOpen: () => void;
  generating: boolean;
  onDownloadTableQr: (mesa: number) => void;
  onPrintAll: () => void;
}

export function PublicMenuTableQrSection({
  tableCount,
  items,
  isOpen,
  onToggleOpen,
  generating,
  onDownloadTableQr,
  onPrintAll,
}: PublicMenuTableQrSectionProps) {
  if (tableCount <= 0) {
    return (
      <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex flex-col gap-2">
        <h3 className="font-['Space_Grotesk'] text-sm font-bold text-foreground">
          Códigos QR por mesa
        </h3>
        <p className="text-xs text-muted-foreground">
          Configurá la cantidad de mesas en Ajustes para generar los QR.
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex flex-col gap-4">
      {/* Header & Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <QrCode className="size-4 text-primary" />
          <h3 className="font-['Space_Grotesk'] text-sm font-bold text-foreground">
            Códigos QR por mesa
          </h3>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
            {tableCount} {tableCount === 1 ? "mesa" : "mesas"}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleOpen}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold cursor-pointer transition-colors"
        >
          {isOpen ? (
            <>
              <span>Ocultar</span>
              <ChevronUp className="size-3.5" />
            </>
          ) : (
            <>
              <span>Ver códigos QR</span>
              <ChevronDown className="size-3.5" />
            </>
          )}
        </button>
      </div>

      {/* Note about 4-digit code */}
      <div className="flex items-start gap-2 bg-muted/30 border border-border/60 rounded-xl p-3 text-[11px] text-muted-foreground">
        <Info className="size-4 text-primary shrink-0 mt-0.5" />
        <p>
          Cada QR lleva la mesa. El cliente ingresa el código de 4 dígitos de la mesa al enviar un
          pedido.
        </p>
      </div>

      {isOpen && (
        <div className="flex flex-col gap-4 pt-1 border-t border-border/50">
          {/* Action bar: Print all button */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {generating ? "Generando códigos QR..." : `${items.length} tarjetas listas`}
            </span>

            <button
              type="button"
              onClick={onPrintAll}
              disabled={generating || items.length === 0}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground py-2 px-3 rounded-xl font-bold text-xs cursor-pointer hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
            >
              <Printer className="size-3.5" />
              Imprimir todos
            </button>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((item) => (
              <div
                key={item.mesa}
                className="rounded-xl border border-border bg-muted/20 p-3 flex flex-col items-center text-center gap-2"
              >
                <span className="font-['Space_Grotesk'] text-xs font-bold text-foreground">
                  Mesa {item.mesa}
                </span>

                {item.dataUrl ? (
                  <div className="bg-white p-2 rounded-xl border border-black/10 shadow-inner">
                    <img
                      src={item.dataUrl}
                      alt={`QR Mesa ${item.mesa}`}
                      className="size-24 sm:size-28 object-contain"
                    />
                  </div>
                ) : (
                  <div className="size-24 sm:size-28 rounded-xl bg-muted/60 animate-pulse flex items-center justify-center text-[10px] text-muted-foreground">
                    <RefreshCw className="size-4 animate-spin text-primary" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onDownloadTableQr(item.mesa)}
                  disabled={!item.dataUrl}
                  className="w-full flex items-center justify-center gap-1 text-[11px] font-semibold py-1.5 px-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg border border-border cursor-pointer transition-colors disabled:opacity-50 mt-1"
                >
                  <Download className="size-3" />
                  Descargar PNG
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
