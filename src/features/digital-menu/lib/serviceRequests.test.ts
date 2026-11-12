import { describe, expect, it } from "vitest";
import {
  buildServiceRequestRpcArgs,
  GENERIC_SERVICE_REQUEST_ERROR_MESSAGE,
  INCORRECT_TABLE_CODE_MESSAGE,
  isValidTableCode,
  mapServiceRequestError,
  parseServiceRequestResult,
  resolveServiceRequestOutcome,
} from "./serviceRequests";
import { RESTAURANT_CLOSED_MESSAGE } from "./onlineStatus";

describe("serviceRequests pure lib", () => {
  describe("buildServiceRequestRpcArgs", () => {
    it("normalizes and trims parameters correctly for waiter kind", () => {
      const args = buildServiceRequestRpcArgs({
        slug: "  My-Restaurant  ",
        mesa: 5,
        mesaCodigo: " 1234 ",
        kind: "waiter",
      });

      expect(args).toEqual({
        p_public_slug: "my-restaurant",
        p_mesa_numero: 5,
        p_mesa_codigo: "1234",
        p_kind: "waiter",
      });
    });

    it("normalizes and trims parameters correctly for bill kind", () => {
      const args = buildServiceRequestRpcArgs({
        slug: "bistro-cafe",
        mesa: 12,
        mesaCodigo: "9876",
        kind: "bill",
      });

      expect(args).toEqual({
        p_public_slug: "bistro-cafe",
        p_mesa_numero: 12,
        p_mesa_codigo: "9876",
        p_kind: "bill",
      });
    });
  });

  describe("isValidTableCode", () => {
    it("returns true for exactly 4 numeric digits", () => {
      expect(isValidTableCode("1234")).toBe(true);
      expect(isValidTableCode("0000")).toBe(true);
      expect(isValidTableCode("9999")).toBe(true);
      expect(isValidTableCode(" 4321 ")).toBe(true);
    });

    it("returns false for non-4-digit strings or non-digits", () => {
      expect(isValidTableCode("123")).toBe(false);
      expect(isValidTableCode("12345")).toBe(false);
      expect(isValidTableCode("12a4")).toBe(false);
      expect(isValidTableCode("abcd")).toBe(false);
      expect(isValidTableCode("")).toBe(false);
      expect(isValidTableCode("   ")).toBe(false);
      expect(isValidTableCode(null)).toBe(false);
      expect(isValidTableCode(undefined)).toBe(false);
      expect(isValidTableCode(1234 as unknown as string)).toBe(false);
    });
  });

  describe("parseServiceRequestResult", () => {
    it("parses valid new service request payload", () => {
      const result = parseServiceRequestResult({
        id: "550e8400-e29b-41d4-a716-446655440000",
        already_pending: false,
      });

      expect(result).toEqual({
        id: "550e8400-e29b-41d4-a716-446655440000",
        alreadyPending: false,
      });
    });

    it("parses valid already-pending service request payload", () => {
      const result = parseServiceRequestResult({
        id: "550e8400-e29b-41d4-a716-446655440001",
        already_pending: true,
      });

      expect(result).toEqual({
        id: "550e8400-e29b-41d4-a716-446655440001",
        alreadyPending: true,
      });
    });

    it("returns null for malformed or missing fields", () => {
      expect(parseServiceRequestResult(null)).toBeNull();
      expect(parseServiceRequestResult(undefined)).toBeNull();
      expect(parseServiceRequestResult({})).toBeNull();
      expect(parseServiceRequestResult("not an object")).toBeNull();
      expect(parseServiceRequestResult({ id: "" })).toBeNull();
      expect(parseServiceRequestResult({ id: "valid-id" })).toBeNull();
      expect(parseServiceRequestResult({ already_pending: false })).toBeNull();
      expect(
        parseServiceRequestResult({
          id: "valid-id",
          already_pending: "false",
        })
      ).toBeNull();
    });
  });

  describe("mapServiceRequestError", () => {
    it("maps table code error to code field with standard message", () => {
      const err = mapServiceRequestError("Código de mesa incorrecto");
      expect(err).toEqual({
        field: "code",
        message: INCORRECT_TABLE_CODE_MESSAGE,
      });
    });

    it("maps lowercase or wrapped code error to code field", () => {
      const err = mapServiceRequestError("Error: código de mesa incorrecto.");
      expect(err).toEqual({
        field: "code",
        message: INCORRECT_TABLE_CODE_MESSAGE,
      });
    });

    it("maps restaurant closed exception to general field with RESTAURANT_CLOSED_MESSAGE", () => {
      const err = mapServiceRequestError("El restaurante se encuentra cerrado en este momento");
      expect(err).toEqual({
        field: "general",
        message: RESTAURANT_CLOSED_MESSAGE,
      });
    });

    it("maps RESTAURANT_CLOSED error token to general field", () => {
      const err = mapServiceRequestError("RESTAURANT_CLOSED");
      expect(err).toEqual({
        field: "general",
        message: RESTAURANT_CLOSED_MESSAGE,
      });
    });

    it("passes through unknown specific errors to general field", () => {
      const err = mapServiceRequestError("Debes seleccionar una mesa");
      expect(err).toEqual({
        field: "general",
        message: "Debes seleccionar una mesa",
      });
    });

    it("uses generic fallback for empty or whitespace-only errors", () => {
      expect(mapServiceRequestError("")).toEqual({
        field: "general",
        message: GENERIC_SERVICE_REQUEST_ERROR_MESSAGE,
      });
      expect(mapServiceRequestError(null)).toEqual({
        field: "general",
        message: GENERIC_SERVICE_REQUEST_ERROR_MESSAGE,
      });
    });
  });

  describe("resolveServiceRequestOutcome", () => {
    describe("when errorMessage is provided", () => {
      it("maps table code error to status error with codeError", () => {
        const outcome = resolveServiceRequestOutcome({
          data: null,
          errorMessage: "Código de mesa incorrecto",
        });

        expect(outcome).toEqual({
          status: "error",
          codeError: INCORRECT_TABLE_CODE_MESSAGE,
          generalError: null,
        });
      });

      it("maps wrapped lowercase table code error to codeError", () => {
        const outcome = resolveServiceRequestOutcome({
          data: null,
          errorMessage: "rpc failure: código de mesa incorrecto.",
        });

        expect(outcome).toEqual({
          status: "error",
          codeError: INCORRECT_TABLE_CODE_MESSAGE,
          generalError: null,
        });
      });

      it("maps restaurant closed error to status error with generalError", () => {
        const outcome = resolveServiceRequestOutcome({
          data: null,
          errorMessage: "El restaurante se encuentra cerrado en este momento",
        });

        expect(outcome).toEqual({
          status: "error",
          codeError: null,
          generalError: RESTAURANT_CLOSED_MESSAGE,
        });
      });

      it("maps RESTAURANT_CLOSED token to generalError", () => {
        const outcome = resolveServiceRequestOutcome({
          data: null,
          errorMessage: "RESTAURANT_CLOSED",
        });

        expect(outcome).toEqual({
          status: "error",
          codeError: null,
          generalError: RESTAURANT_CLOSED_MESSAGE,
        });
      });

      it("maps thrown error message passed as string to generalError", () => {
        const thrownError = new Error("Failed to fetch RPC endpoint");
        const outcome = resolveServiceRequestOutcome({
          data: null,
          errorMessage: thrownError.message,
        });

        expect(outcome).toEqual({
          status: "error",
          codeError: null,
          generalError: "Failed to fetch RPC endpoint",
        });
      });

      it("maps generic unexpected error text to generalError", () => {
        const outcome = resolveServiceRequestOutcome({
          data: null,
          errorMessage: "Mesa no habilitada para pedidos",
        });

        expect(outcome).toEqual({
          status: "error",
          codeError: null,
          generalError: "Mesa no habilitada para pedidos",
        });
      });
    });

    describe("when errorMessage is absent and data is valid", () => {
      it("resolves newly sent request as status sent", () => {
        const outcome = resolveServiceRequestOutcome({
          data: {
            id: "770e8400-e29b-41d4-a716-446655440000",
            already_pending: false,
          },
        });

        expect(outcome).toEqual({
          status: "sent",
          codeError: null,
          generalError: null,
        });
      });

      it("resolves already pending request as status already_pending", () => {
        const outcome = resolveServiceRequestOutcome({
          data: {
            id: "770e8400-e29b-41d4-a716-446655440001",
            already_pending: true,
          },
        });

        expect(outcome).toEqual({
          status: "already_pending",
          codeError: null,
          generalError: null,
        });
      });

      it("handles explicit null or undefined errorMessage with valid data", () => {
        const outcomeNull = resolveServiceRequestOutcome({
          data: { id: "valid-id", already_pending: false },
          errorMessage: null,
        });
        expect(outcomeNull.status).toBe("sent");

        const outcomeUndefined = resolveServiceRequestOutcome({
          data: { id: "valid-id", already_pending: true },
          errorMessage: undefined,
        });
        expect(outcomeUndefined.status).toBe("already_pending");
      });
    });

    describe("when response shape is unexpected (unparseable data)", () => {
      it("returns status error with generic error when data is null and no errorMessage", () => {
        const outcome = resolveServiceRequestOutcome({
          data: null,
        });

        expect(outcome).toEqual({
          status: "error",
          codeError: null,
          generalError: GENERIC_SERVICE_REQUEST_ERROR_MESSAGE,
        });
      });

      it("returns status error with generic error when data is undefined", () => {
        const outcome = resolveServiceRequestOutcome({
          data: undefined,
        });

        expect(outcome).toEqual({
          status: "error",
          codeError: null,
          generalError: GENERIC_SERVICE_REQUEST_ERROR_MESSAGE,
        });
      });

      it("returns status error with generic error when data is malformed object or missing fields", () => {
        expect(resolveServiceRequestOutcome({ data: {} })).toEqual({
          status: "error",
          codeError: null,
          generalError: GENERIC_SERVICE_REQUEST_ERROR_MESSAGE,
        });

        expect(resolveServiceRequestOutcome({ data: { id: "" } })).toEqual({
          status: "error",
          codeError: null,
          generalError: GENERIC_SERVICE_REQUEST_ERROR_MESSAGE,
        });

        expect(resolveServiceRequestOutcome({ data: { already_pending: false } })).toEqual({
          status: "error",
          codeError: null,
          generalError: GENERIC_SERVICE_REQUEST_ERROR_MESSAGE,
        });

        expect(resolveServiceRequestOutcome({ data: "string payload" })).toEqual({
          status: "error",
          codeError: null,
          generalError: GENERIC_SERVICE_REQUEST_ERROR_MESSAGE,
        });
      });

      it("returns status error with generic error when errorMessage is empty string and data is null", () => {
        const outcome = resolveServiceRequestOutcome({
          data: null,
          errorMessage: "",
        });

        expect(outcome).toEqual({
          status: "error",
          codeError: null,
          generalError: GENERIC_SERVICE_REQUEST_ERROR_MESSAGE,
        });
      });
    });
  });
});
