export function formatDgiiAmount(value: number): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error("Un monto fiscal no es válido.");
  }
  return number.toFixed(2);
}

export function formatDgiiField(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\|/g, "");
}

export function formatDgiiDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Una fecha fiscal no es válida.");
  }
  return value.slice(0, 10).replace(/-/g, "");
}

export function normalizeDgiiRnc(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}
