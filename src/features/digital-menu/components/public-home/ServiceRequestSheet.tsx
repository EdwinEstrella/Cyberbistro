import { useEffect, useState, type FormEvent } from "react";
import { BellRing, CheckCircle2, ClockAlert } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { isValidTableCode, type ServiceRequestKind } from "../../lib/serviceRequests";
import type { ServiceRequestStatus } from "../../hooks/useServiceRequest";

export interface ServiceRequestSheetProps {
  isOpen: boolean;
  kind: ServiceRequestKind | null;
  status: ServiceRequestStatus;
  codeError: string | null;
  generalError: string | null;
  onSubmit: (code: string) => void;
  onClose: () => void;
}

export function ServiceRequestSheet({
  isOpen,
  kind,
  status,
  codeError,
  generalError,
  onSubmit,
  onClose,
}: ServiceRequestSheetProps) {
  const [code, setCode] = useState("");

  // Reset local code input whenever sheet is reopened or closed
  useEffect(() => {
    if (!isOpen) {
      setCode("");
    }
  }, [isOpen]);

  const title = kind === "waiter" ? "Llamar al mesero" : "Pedir la cuenta";
  const isComplete = status === "sent" || status === "already_pending";
  const isSubmitDisabled = status === "sending" || !isValidTableCode(code);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isSubmitDisabled) {
      onSubmit(code);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <div data-testid="service-request-sheet" className="space-y-4 pt-1">
        {/* Result states */}
        {isComplete ? (
          <div data-testid="service-request-result" className="py-4 text-center space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400">
              {status === "sent" ? (
                <CheckCircle2 className="size-7" />
              ) : (
                <ClockAlert className="size-7 text-amber-400" />
              )}
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">
                {status === "sent"
                  ? "¡Listo! Avisamos al personal, ya van en camino."
                  : "Ya avisamos al personal, ya van en camino."}
              </h3>
              <p className="text-xs text-zinc-400">
                {kind === "waiter"
                  ? "Un mozo se acercará a tu mesa a la brevedad."
                  : "Un mozo se acercará con la cuenta a tu mesa."}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 active:scale-98 cursor-pointer shadow-md"
            >
              Entendido
            </button>
          </div>
        ) : (
          /* Form state: idle | sending | error */
          <form onSubmit={handleSubmit} className="space-y-4">
            {generalError && (
              <div
                role="alert"
                data-testid="service-request-general-error"
                className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs leading-relaxed text-red-300"
              >
                {generalError}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="service-request-code"
                className="block text-xs font-semibold text-zinc-300"
              >
                Código de mesa
              </label>
              <input
                id="service-request-code"
                data-testid="service-request-code-input"
                type="text"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="4 dígitos"
                className={`w-full rounded-xl border bg-[#18181b] px-4 py-3 text-center text-lg font-bold tracking-widest text-white placeholder-zinc-600 outline-none transition focus:ring-2 ${
                  codeError
                    ? "border-red-500/50 focus:border-red-400 focus:ring-red-400/20"
                    : "border-[#27272a] focus:border-emerald-400/50 focus:ring-emerald-400/20"
                }`}
              />
              <p className="text-[11px] text-zinc-500">
                Ingresá el código de 4 dígitos que está en tu mesa
              </p>
              {codeError && (
                <p
                  role="alert"
                  data-testid="service-request-code-error"
                  className="text-xs font-medium text-red-400 mt-1"
                >
                  {codeError}
                </p>
              )}
            </div>

            <button
              type="submit"
              data-testid="service-request-submit-button"
              disabled={isSubmitDisabled}
              aria-disabled={isSubmitDisabled}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold transition shadow-sm ${
                isSubmitDisabled
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/40"
                  : "bg-white text-zinc-950 hover:bg-zinc-100 active:scale-98 cursor-pointer shadow-md"
              }`}
            >
              {status === "sending" ? (
                <span>Enviando...</span>
              ) : (
                <>
                  <BellRing className="size-4" />
                  <span>{kind === "waiter" ? "Llamar al mesero" : "Pedir la cuenta"}</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </BottomSheet>
  );
}
