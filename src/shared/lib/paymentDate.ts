export function clampPaymentDate(day: number, month: number, year: number): Date {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError("Payment day must be an integer between 1 and 31.");
  }
  if (!Number.isInteger(month) || month < 0 || month > 11) {
    throw new RangeError("Month must be zero-based and between 0 and 11.");
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPaymentAlertStorageKey(tenantId: string, dateKey: string): string {
  return `payment-alert:${tenantId}:${dateKey}`;
}

export function getPaymentAlert(
  today: Date,
  paymentDay: number | null
): { kind: "reminder" | "today"; dateKey: string } | null {
  if (paymentDay === null) return null;
  const paymentDate = clampPaymentDate(paymentDay, today.getMonth(), today.getFullYear());
  const todayKey = formatLocalDateKey(today);
  const paymentKey = formatLocalDateKey(paymentDate);
  if (todayKey === paymentKey) return { kind: "today", dateKey: todayKey };
  const dayBefore = new Date(paymentDate);
  dayBefore.setDate(paymentDate.getDate() - 1);
  const reminderKey = formatLocalDateKey(dayBefore);
  return todayKey === reminderKey ? { kind: "reminder", dateKey: todayKey } : null;
}
