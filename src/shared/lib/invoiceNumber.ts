import { supabase } from "./supabase";
import { isDesktopCloudUnavailable } from "./cloudAvailability";

function toValidInvoiceNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const normalized = Math.floor(n);
  return normalized > 0 ? normalized : null;
}

function validateReservedNumbers(value: unknown, count: number): number[] {
  if (!Array.isArray(value) || value.length !== count) {
    throw new Error("La reserva de números de factura devolvió una cantidad inválida.");
  }
  const numbers = value.map(toValidInvoiceNumber);
  if (numbers.some((number) => number == null)) {
    throw new Error("La reserva devolvió un número de factura inválido.");
  }
  const valid = numbers as number[];
  if (valid.some((number, index) => index > 0 && number !== valid[index - 1] + 1)) {
    throw new Error("La reserva devolvió una secuencia de facturas no contigua.");
  }
  return valid;
}

async function reserveFromCloud(tenantId: string, count: number, minimumNumber: number): Promise<number[]> {
  const { data, error } = await supabase.rpc("cloudix_reserve_invoice_numbers_v2", {
    p_tenant_id: tenantId,
    p_count: count,
    p_minimum_number: minimumNumber,
  });
  if (error) throw new Error(error.message || "No se pudo reservar la secuencia de factura.");
  const row = Array.isArray(data) ? data[0] : data;
  const first = toValidInvoiceNumber((row as { first_number?: unknown } | null)?.first_number);
  const last = toValidInvoiceNumber((row as { last_number?: unknown } | null)?.last_number);
  if (first == null || last == null || last !== first + count - 1) {
    throw new Error("La reserva remota devolvió un rango de facturas inválido.");
  }
  return Array.from({ length: count }, (_, index) => first + index);
}

async function reserveFromDesktop(tenantId: string, count: number): Promise<number[]> {
  const reserve = typeof window !== "undefined" ? window.electronAPI?.reserveInvoiceNumbers : undefined;
  if (!reserve) throw new Error("La reserva local de números de factura no está disponible.");
  const result = await reserve({ tenantId, count });
  return validateReservedNumbers(result?.data, count);
}

export async function getNextFacturaNumbers(tenantId: string, count = 1): Promise<number[]> {
  if (!tenantId) throw new Error("No se puede reservar una factura sin restaurante.");
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
    throw new Error("La cantidad de números de factura solicitada no es válida.");
  }

  const isDesktop = typeof window !== "undefined" && Boolean(window.electronAPI);
  const cloudUnavailable = isDesktop && await isDesktopCloudUnavailable();
  const online = typeof navigator !== "undefined" && navigator.onLine;

  if (online && !cloudUnavailable) {
    let minimumNumber = 1;
    if (isDesktop) {
      const getFloor = window.electronAPI?.getInvoiceNumberFloor;
      if (!getFloor) throw new Error("No se puede reconciliar la secuencia local de facturas.");
      const result = await getFloor({ tenantId });
      minimumNumber = toValidInvoiceNumber(result?.data) ?? 0;
      if (minimumNumber < 1) throw new Error("La secuencia local de facturas es inválida.");
    }
    return reserveFromCloud(tenantId, count, minimumNumber);
  }
  if (isDesktop) return reserveFromDesktop(tenantId, count);
  throw new Error("No se puede facturar sin conexión porque no hay una secuencia local autorizada.");
}

export async function getNextFacturaNumber(tenantId: string): Promise<number> {
  const [number] = await getNextFacturaNumbers(tenantId, 1);
  return number;
}
