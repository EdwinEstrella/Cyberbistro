import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../../shared/hooks/useAuth";
import { defaultRouteForRol, isAppRouteAllowed } from "../../shared/lib/roleNav";

export function RoleGuard({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated, rol } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px]">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px]">Cargando...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  if (!isAppRouteAllowed(rol, location.pathname)) {
    return <Navigate to={defaultRouteForRol(rol)} replace />;
  }

  return <>{children}</>;
}
