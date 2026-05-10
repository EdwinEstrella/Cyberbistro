import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../../shared/hooks/useAuth";
import { getRoleGuardDecision } from "./roleGuardDecision";

function TenantAccessDenied({
  reason,
  onRetry,
  onSignOut,
}: {
  reason: 'blocked' | 'unlinked';
  onRetry: () => void;
  onSignOut: () => Promise<void>;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[240px] gap-4 px-6 text-center">
      <p className="font-['Space_Grotesk',sans-serif] text-[#e5e5e5] text-[15px] max-w-md">
        {reason === 'blocked'
          ? 'Tu cuenta está bloqueada. Contactá al administrador del sistema para recuperar el acceso.'
          : 'Esta cuenta no está vinculada a ningún negocio. El administrador debe darte acceso desde Soporte.'}
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          className="font-['Space_Grotesk',sans-serif] px-4 py-2 rounded bg-[#262626] text-[#ff906d] border border-[rgba(255,144,109,0.35)]"
          onClick={() => onRetry()}
        >
          Reintentar
        </button>
        <button
          type="button"
          className="font-['Space_Grotesk',sans-serif] px-4 py-2 rounded bg-[#131313] text-[#adaaaa] border border-[rgba(72,72,71,0.4)]"
          onClick={async () => {
            try {
              await onSignOut();
            } catch {
              /* sesión ya inválida */
            }
            navigate("/", { replace: true });
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

export function RoleGuard({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated, rol, tenantId, user, signOut, refreshSession, tenantAccessDeniedReason } = useAuth();
  const location = useLocation();
  const decision = getRoleGuardDecision({
    loading,
    isAuthenticated,
    userExists: Boolean(user),
    tenantId,
    rol,
    pathname: location.pathname,
    tenantAccessDeniedReason,
  });

  if (decision.type === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px]">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px]">Cargando...</span>
      </div>
    );
  }

  if (decision.type === "redirect_login") {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  if (decision.type === "tenant_access_denied") {
    return (
      <TenantAccessDenied
        reason={decision.reason}
        onRetry={() => refreshSession({ showLoading: true })}
        onSignOut={signOut}
      />
    );
  }

  if (decision.type === "redirect_role") {
    return <Navigate to={decision.to} replace />;
  }

  return <>{children}</>;
}
