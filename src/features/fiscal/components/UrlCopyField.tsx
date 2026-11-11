import { Copy } from "lucide-react";

export function UrlCopyField({ label, field, onCopy }: { label: string; field: string; onCopy: (value: string) => void }) {
  // DGII portal field already provides "https://" and the service path; shows only the host/tenant path to copy.
  return (
    <div className="mb-4 last:mb-0">
      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="mt-1.5 flex gap-2">
        <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-xl border border-green-500/30 font-mono text-[11px]">
          <input type="text" readOnly value={field} className="min-w-0 flex-1 bg-green-500/5 px-3 py-2.5 font-bold text-green-700 outline-none dark:text-green-400" />
        </div>
        <button type="button" onClick={() => onCopy(field)} title="Copiar lo que va en el campo del portal" className="flex shrink-0 items-center justify-center rounded-xl border border-border bg-background px-3 transition-colors hover:bg-muted">
          <Copy className="size-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
