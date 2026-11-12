import { isRestaurantClosedError, RESTAURANT_CLOSED_MESSAGE } from "./onlineStatus";

export type ServiceRequestKind = "waiter" | "bill";

export interface BuildServiceRequestRpcArgsOptions {
  slug: string;
  mesa: number;
  mesaCodigo: string;
  kind: ServiceRequestKind;
}

export interface ServiceRequestRpcArgs {
  p_public_slug: string;
  p_mesa_numero: number;
  p_mesa_codigo: string;
  p_kind: string;
}

/**
 * Builds the arguments payload for the public.create_public_service_request RPC.
 */
export function buildServiceRequestRpcArgs({
  slug,
  mesa,
  mesaCodigo,
  kind,
}: BuildServiceRequestRpcArgsOptions): ServiceRequestRpcArgs {
  return {
    p_public_slug: slug.trim().toLowerCase(),
    p_mesa_numero: mesa,
    p_mesa_codigo: mesaCodigo.trim(),
    p_kind: kind,
  };
}

/**
 * Validates table security code (strictly 4 numeric digits after trim).
 */
export function isValidTableCode(code: string | null | undefined): boolean {
  if (typeof code !== "string") return false;
  return /^\d{4}$/.test(code.trim());
}

export interface ServiceRequestResult {
  id: string;
  alreadyPending: boolean;
}

/**
 * Defensively parses the jsonb result from create_public_service_request.
 * Expected shape: { "id": "<uuid>", "already_pending": boolean }.
 */
export function parseServiceRequestResult(data: unknown): ServiceRequestResult | null {
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id.trim() === "") return null;
  if (typeof obj.already_pending !== "boolean") return null;
  return {
    id: obj.id.trim(),
    alreadyPending: obj.already_pending,
  };
}

export const INCORRECT_TABLE_CODE_MESSAGE =
  "Código incorrecto. Verificá el código en la mesa.";

export const GENERIC_SERVICE_REQUEST_ERROR_MESSAGE =
  "No se pudo enviar la solicitud. Por favor, intentá nuevamente.";

export interface ServiceRequestMappedError {
  field: "code" | "general";
  message: string;
}

/**
 * Maps error messages from create_public_service_request RPC into field-targeted UI errors.
 */
export function mapServiceRequestError(message: string | null | undefined): ServiceRequestMappedError {
  const text = typeof message === "string" ? message.trim() : "";
  const lower = text.toLowerCase();

  if (lower.includes("código de mesa incorrecto")) {
    return {
      field: "code",
      message: INCORRECT_TABLE_CODE_MESSAGE,
    };
  }

  if (isRestaurantClosedError(text)) {
    return {
      field: "general",
      message: RESTAURANT_CLOSED_MESSAGE,
    };
  }

  return {
    field: "general",
    message: text.length > 0 ? text : GENERIC_SERVICE_REQUEST_ERROR_MESSAGE,
  };
}

export interface ResolveServiceRequestOutcomeInput {
  data: unknown;
  errorMessage?: string | null;
}

export interface ServiceRequestOutcome {
  status: "sent" | "already_pending" | "error";
  codeError: string | null;
  generalError: string | null;
}

/**
 * Resolves the service request RPC result or error into a deterministic UI outcome.
 */
export function resolveServiceRequestOutcome(input: {
  data: unknown;
  errorMessage?: string | null;
}): {
  status: "sent" | "already_pending" | "error";
  codeError: string | null;
  generalError: string | null;
} {
  const errorMessage =
    typeof input.errorMessage === "string" ? input.errorMessage.trim() : "";

  if (errorMessage.length > 0) {
    const mapped = mapServiceRequestError(errorMessage);
    return {
      status: "error",
      codeError: mapped.field === "code" ? mapped.message : null,
      generalError: mapped.field === "general" ? mapped.message : null,
    };
  }

  const parsed = parseServiceRequestResult(input.data);
  if (!parsed) {
    return {
      status: "error",
      codeError: null,
      generalError: GENERIC_SERVICE_REQUEST_ERROR_MESSAGE,
    };
  }

  if (parsed.alreadyPending) {
    return {
      status: "already_pending",
      codeError: null,
      generalError: null,
    };
  }

  return {
    status: "sent",
    codeError: null,
    generalError: null,
  };
}
