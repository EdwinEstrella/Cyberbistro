export function getCancelItemConfirmMessage(itemName: string, isCompanyOrder: boolean): string {
  if (isCompanyOrder) {
    return `¿Cancelar ${itemName}? Se descuenta del total y de la cuenta por cobrar.`;
  }
  return `¿Cancelar ${itemName}? Se descuenta del total.`;
}

export function mapCancelItemError(error: unknown): string {
  if (!error) return 'Error desconocido al cancelar el ítem.';

  const message =
    typeof error === 'string'
      ? error
      : (error as { message?: string; details?: string; hint?: string })?.message ||
        (error as { details?: string })?.details ||
        String(error);

  if (message.includes('PAYMENT_EXCEEDS_TOTAL')) {
    return 'La cuenta ya tiene pagos mayores al nuevo total';
  }
  if (message.includes('ITEM_NOT_ACTIVE')) {
    return 'El ítem ya fue cancelado o no está activo.';
  }
  if (message.includes('ORDER_NOT_EDITABLE')) {
    return 'El pedido no se puede editar en su estado actual.';
  }
  if (message.includes('UNAUTHORIZED')) {
    return 'No tenés permisos para modificar este pedido.';
  }
  if (message.includes('ITEM_NOT_FOUND')) {
    return 'El ítem no fue encontrado.';
  }
  if (message.includes('ORDER_NOT_FOUND')) {
    return 'El pedido no fue encontrado.';
  }
  if (
    message.toLowerCase().includes('failed to fetch') ||
    message.toLowerCase().includes('network') ||
    message.toLowerCase().includes('offline') ||
    message.toLowerCase().includes('timeout')
  ) {
    return 'Error de conexión al cancelar el ítem. Verificá tu internet.';
  }

  return message;
}
