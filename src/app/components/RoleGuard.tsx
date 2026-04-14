import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../../shared/hooks/useAuth";
import { getRoleGuardDecision } from "./roleGuardDecision";

function TenantLinkRequired({
  onRetry,
  onSignOut,
}: {
  onRetry: () => void;
  onSignOut: () => Promise<void>;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[240px] gap-4 px-6 text-center">
      <p className="font-['Space_Grotesk',sans-serif] text-[#e5e5e5] text-[15px] max-w-md">
        Tu sesión es válida pero esta cuenta no está vinculada a ningún negocio. Pedí acceso al administrador o
        desde Soporte.
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
  const { loading, isAuthenticated, rol, tenantId, user, signOut, refreshSession } = useAuth();
  const location = useLocation();
  const decision = getRoleGuardDecision({
    loading,
    isAuthenticated,
    userExists: Boolean(user),
    tenantId,
    rol,
    pathname: location.pathname,
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

  if (decision.type === "tenant_link_required") {
    return (
      <TenantLinkRequired
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
