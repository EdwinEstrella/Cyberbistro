import { useCallback, useState } from "react";
import { supabase } from "../../../shared/lib/supabase";
import {
  buildServiceRequestRpcArgs,
  isValidTableCode,
  resolveServiceRequestOutcome,
  INCORRECT_TABLE_CODE_MESSAGE,
  type ServiceRequestKind,
} from "../lib/serviceRequests";

export type ServiceRequestStatus =
  | "idle"
  | "sending"
  | "sent"
  | "already_pending"
  | "error";

export interface UseServiceRequestOptions {
  slug: string;
  mesa: number;
}

export interface UseServiceRequestReturn {
  status: ServiceRequestStatus;
  codeError: string | null;
  generalError: string | null;
  submit: (kind: ServiceRequestKind, code: string) => Promise<boolean>;
  reset: () => void;
}

/**
 * Hook to manage client service requests ("waiter" or "bill") for a table.
 *
 * Implements:
 * - State machine: idle | sending | sent | already_pending | error
 * - Double submit prevention
 * - Pre-flight 4-digit code validation
 * - Mapping of RPC errors into codeError or generalError
 */
export function useServiceRequest({
  slug,
  mesa,
}: UseServiceRequestOptions): UseServiceRequestReturn {
  const [status, setStatus] = useState<ServiceRequestStatus>("idle");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setCodeError(null);
    setGeneralError(null);
  }, []);

  const submit = useCallback(
    async (kind: ServiceRequestKind, code: string): Promise<boolean> => {
      // Prevent double submit while sending
      if (status === "sending") {
        return false;
      }

      setCodeError(null);
      setGeneralError(null);

      if (!isValidTableCode(code)) {
        setCodeError(INCORRECT_TABLE_CODE_MESSAGE);
        setStatus("error");
        return false;
      }

      setStatus("sending");

      const rpcArgs = buildServiceRequestRpcArgs({
        slug,
        mesa,
        mesaCodigo: code,
        kind,
      });

      try {
        const { data, error: rpcError } = await supabase.rpc(
          "create_public_service_request",
          rpcArgs as Parameters<typeof supabase.rpc>[1]
        );

        if (rpcError) {
          const outcome = resolveServiceRequestOutcome({
            data,
            errorMessage: rpcError.message,
          });
          setCodeError(outcome.codeError);
          setGeneralError(outcome.generalError);
          setStatus(outcome.status);
          return false;
        }

        const outcome = resolveServiceRequestOutcome({ data });
        setCodeError(outcome.codeError);
        setGeneralError(outcome.generalError);
        setStatus(outcome.status);
        return outcome.status !== "error";
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const outcome = resolveServiceRequestOutcome({
          data: null,
          errorMessage: msg,
        });
        setCodeError(outcome.codeError);
        setGeneralError(outcome.generalError);
        setStatus(outcome.status);
        return false;
      }
    },
    [slug, mesa, status]
  );

  return {
    status,
    codeError,
    generalError,
    submit,
    reset,
  };
}
