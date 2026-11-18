export const DISH_PHOTO_ERROR_CODES = [
  "unsupported_format",
  "encode_failed",
  "missing_token",
  "invalid_token",
  "invalid_tenant",
  "invalid_plato",
  "unsupported_type",
  "too_large",
  "forbidden",
  "auth_unavailable",
  "network",
  "unknown",
] as const;

export type DishPhotoErrorCode = (typeof DISH_PHOTO_ERROR_CODES)[number];

export function isDishPhotoErrorCode(value: unknown): value is DishPhotoErrorCode {
  return (
    typeof value === "string" &&
    (DISH_PHOTO_ERROR_CODES as readonly string[]).includes(value)
  );
}

export class DishPhotoError extends Error {
  readonly code: DishPhotoErrorCode;

  constructor(code: DishPhotoErrorCode, message?: string) {
    super(message || code);
    this.name = "DishPhotoError";
    this.code = code;
    Object.setPrototypeOf(this, DishPhotoError.prototype);
  }
}

export function dishPhotoErrorMessage(code: string): string {
  switch (code) {
    case "unsupported_format":
      return "Ese formato no se puede leer en este dispositivo. Usa una foto JPG o PNG.";
    case "encode_failed":
      return "No se pudo codificar la imagen en formato WebP.";
    case "missing_token":
    case "invalid_token":
      return "Tu sesión ha expirado o no es válida. Inicia sesión de nuevo.";
    case "forbidden":
      return "Solo un administrador del negocio puede subir fotos.";
    case "too_large":
      return "La imagen es demasiado pesada (máximo 1.5 MB). Intenta con otra foto.";
    case "unsupported_type":
      return "El tipo de archivo no es compatible. Debe ser una imagen WebP válida.";
    case "invalid_tenant":
    case "invalid_plato":
      return "Datos de restaurante o plato inválidos.";
    case "auth_unavailable":
      return "El servicio de autenticación no está disponible en este momento. Intenta más tarde.";
    case "network":
      return "Sin conexión. Intenta de nuevo cuando tengas internet.";
    default:
      return "Error inesperado al subir la foto.";
  }
}
