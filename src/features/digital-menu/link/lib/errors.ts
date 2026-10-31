/**
 * Maps RPC error codes or error messages to friendly Spanish user messages.
 */
export function mapLinkOrderError(codeOrMessage?: string | null): string {
  if (!codeOrMessage) {
    return "Ocurrió un error inesperado. Por favor intenta nuevamente.";
  }

  const raw = String(codeOrMessage).trim();
  const upper = raw.toUpperCase();

  if (
    upper.includes("NETWORK") ||
    upper.includes("FETCH") ||
    upper.includes("CONNECTION") ||
    raw.includes("Failed to fetch") ||
    raw.includes("NetworkError")
  ) {
    return "Sin conexión. Este menú necesita internet.";
  }

  if (upper.includes("RESTAURANT_CLOSED")) {
    return "Este restaurante no está trabajando en este momento. Por favor, vuelva en horario laboral.";
  }

  if (upper.includes("ITEM_SOLD_OUT")) {
    return "Uno de los platos se agotó; recargamos el menú";
  }

  if (upper.includes("ITEM_NOT_AVAILABLE")) {
    return "Uno de los platos ya no está disponible en este momento.";
  }

  if (upper.includes("MENU_NOT_AVAILABLE")) {
    return "Este menú no está disponible en este momento.";
  }

  if (upper.includes("LINK_DISABLED")) {
    return "Este enlace de menú ha sido desactivado.";
  }

  if (upper.includes("PLAN_REQUIRED")) {
    return "Este enlace requiere una suscripción empresarial activa.";
  }

  if (upper.includes("EXTRAS_NOT_ALLOWED")) {
    return "Este menú no permite extras adicionales.";
  }

  if (upper.includes("INVALID_EMPLOYEE_NAME")) {
    return "Por favor ingresa tu nombre (debe tener entre 2 y 80 caracteres).";
  }

  if (upper.includes("EMPLOYEE_NOT_AUTHORIZED")) {
    return "No encontramos ese nombre o cédula en la lista de la empresa. Verificá o consultá con tu empresa.";
  }

  if (upper.includes("CREDIT_LIMIT_EXCEEDED")) {
    return "Este pedido supera el crédito disponible de la empresa. Consultá con tu empresa.";
  }

  if (upper.includes("CREDIT_LIMIT_REACHED")) {
    return "El menú de tu empresa está pausado temporalmente. Consultá con tu empresa.";
  }

  if (upper.includes("TOO_MANY_PENDING_ORDERS")) {
    return "Tienes demasiados pedidos pendientes en este momento. Por favor espera a que se procesen.";
  }

  if (upper.includes("INVALID_QUANTITY")) {
    return "La cantidad de platos o extras debe estar entre 1 y 50.";
  }

  if (upper.includes("INVALID_ITEMS")) {
    return "Los productos seleccionados no son válidos.";
  }

  if (upper.includes("NOTES_TOO_LONG")) {
    return "Las notas no pueden exceder los 500 caracteres.";
  }

  return raw;
}

/**
 * Maps menu unavailable reason to a friendly user explanation.
 */
export function mapMenuUnavailableReason(reason?: string | null): string {
  if (!reason) {
    return "Este menú no está disponible en este momento.";
  }
  const upper = String(reason).trim().toUpperCase();
  if (upper.includes("RESTAURANT_CLOSED")) {
    return "Este restaurante no está trabajando en este momento. Por favor, vuelva en horario laboral.";
  }
  if (upper.includes("CREDIT_LIMIT_REACHED")) {
    return "El menú de tu empresa está pausado temporalmente. Consultá con tu empresa.";
  }
  if (upper.includes("LINK_DISABLED")) {
    return "Este enlace de menú ha sido desactivado.";
  }
  if (upper.includes("PLAN_REQUIRED")) {
    return "Este enlace requiere una suscripción empresarial activa.";
  }
  return "Este menú no está disponible en este momento.";
}
