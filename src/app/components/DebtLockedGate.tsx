import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  buildDebtMessage,
  formatDebtAmount,
  type DebtStatus,
  type TenantDebt,
} from "../../shared/lib/tenantDebt";
import {
  SUPPORT_WHATSAPP_PHONE,
  formatSupportPhone,
} from "../../shared/lib/support";

export interface DebtLockedGateProps {
  businessName: string;
  debt: TenantDebt;
  status: DebtStatus;
  onRecheck: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
}

/**
 * Full-screen, non-dismissible lock gate shown when a tenant has overdue debt
 * past the grace period (status.kind === 'locked').
 * Super admins must bypass this lock.
 */
export function DebtLockedGate({
  businessName,
  debt,
  status,
  onRecheck,
  onSignOut,
}: DebtLockedGateProps) {
  const navigate = useNavigate();
  const [isVerifying, setIsVerifying] = useState(false);

  // Periodically check if debt has been cleared and on window focus
  useEffect(() => {
    const handleFocus = () => {
      void onRecheck();
    };

    window.addEventListener("focus", handleFocus);
    const interval = setInterval(() => {
      void onRecheck();
    }, 60_000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, [onRecheck]);

  const debtMessage = buildDebtMessage({ businessName, debt, status });
  const title = debtMessage?.title ?? "Servicio deshabilitado";
  const message =
    debtMessage?.message ??
    `El servicio está deshabilitado por pago pendiente. Contactá a soporte para reactivarlo.`;
  const amountFormatted = formatDebtAmount(debt.amount ?? 0, debt.currency);

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      await onRecheck();
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await onSignOut();
    } catch {
      /* sesión ya inválida */
    }
    navigate("/", { replace: true });
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="debt-gate-title"
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#0c0c0c] text-white p-6 text-center select-none"
    >
      <div className="w-16 h-16 mb-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-8 h-8"
        >
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>

      <h1
        id="debt-gate-title"
        className="font-['Space_Grotesk',sans-serif] text-2xl font-bold text-white uppercase tracking-wider mb-2"
      >
        {title}
      </h1>

      <div className="inline-block px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-base font-bold mb-4">
        {amountFormatted}
      </div>

      <p className="font-['Inter',sans-serif] text-sm text-gray-100 max-w-md mb-8 leading-relaxed">
        {message}
      </p>

      <div className="flex flex-wrap gap-3 justify-center items-center">
        <span className="font-['Space_Grotesk',sans-serif] px-5 py-2.5 rounded-xl bg-[#262626] text-[#ff906d] border border-[rgba(255,144,109,0.35)] font-bold text-sm flex items-center justify-center select-text">
          Contacto: {formatSupportPhone(SUPPORT_WHATSAPP_PHONE)}
        </span>

        <button
          type="button"
          onClick={handleVerify}
          disabled={isVerifying}
          className="font-['Space_Grotesk',sans-serif] px-5 py-2.5 rounded-xl font-bold text-sm text-black cursor-pointer border-none transition-all active:scale-95 disabled:opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)",
          }}
        >
          {isVerifying ? "Verificando..." : "Ya pagué, verificar"}
        </button>

        <button
          type="button"
          onClick={handleSignOut}
          className="font-['Space_Grotesk',sans-serif] px-5 py-2.5 rounded-xl bg-[#1e1e1e] hover:bg-[#282828] text-gray-200 border border-white/10 font-bold text-sm cursor-pointer transition-all active:scale-95"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
