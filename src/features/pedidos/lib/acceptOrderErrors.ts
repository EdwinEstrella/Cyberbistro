export function mapAcceptOrderError(error: unknown): string {
  if (!error) return 'Error desconocido al procesar el pedido.';

  const message =
    typeof error === 'string'
      ? error
      : (error as { message?: string; details?: string; hint?: string })?.message ||
        (error as { details?: string })?.details ||
        String(error);

  const lower = message.toLowerCase();
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('offline') ||
    lower.includes('timeout') ||
    lower.includes('connection refused') ||
    lower.includes('fetch failed') ||
    lower.includes('se requiere conexión a internet')
  ) {
    return 'Se requiere conexión a internet';
  }

  if (message.includes('ORDER_NOT_PENDING')) {
    return 'Este pedido ya fue procesado por otra persona.';
  }
  if (message.includes('NOT_A_COMPANY_ORDER')) {
    return 'El pedido no corresponde a una cuenta corporativa.';
  }
  if (message.includes('ORDER_NOT_FOUND')) {
    return 'El pedido no fue encontrado.';
  }
  if (message.includes('UNAUTHORIZED')) {
    return 'No tenés permisos para realizar esta acción.';
  }
  if (message.includes('PAYMENTS_EXIST')) {
    return 'No se puede revertir: la cuenta ya tiene pagos registrados.';
  }
  if (message.includes('ORDER_NOT_ACCEPTED')) {
    return 'El pedido no está en estado aceptado.';
  }

  return message;
}
