const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SuggestionEmailPayload {
  suggestion_id: string;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Validates the inbound JSON payload.
 * Expects an object with a valid UUID string in `suggestion_id`.
 * Throws ValidationError on missing, malformed, or invalid payloads.
 */
export function parseBody(body: unknown): SuggestionEmailPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Request body must be a JSON object");
  }

  const record = body as Record<string, unknown>;
  const suggestionId = record.suggestion_id;

  if (typeof suggestionId !== "string" || !suggestionId.trim()) {
    throw new ValidationError("suggestion_id is required");
  }

  const normalized = suggestionId.trim().toLowerCase();
  if (!UUID_REGEX.test(normalized)) {
    throw new ValidationError("suggestion_id must be a valid UUID");
  }

  return {
    suggestion_id: normalized,
  };
}
