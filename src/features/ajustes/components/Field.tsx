import type React from "react";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">{label}</label>
      {children}
    </div>
  );
}
