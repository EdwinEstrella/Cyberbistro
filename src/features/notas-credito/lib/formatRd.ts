export function formatRd(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return "RD$ " + (Number.isFinite(n) ? n : 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDateTimeDo(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
