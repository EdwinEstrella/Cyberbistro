import { useAuth } from "../../shared/hooks/useAuth";
import { useSucursal } from "../../app/context/SucursalContext";
import { MenuLinksList } from "./components/MenuLinksList";

export function MenuLinksPage() {
  const { tenantId } = useAuth();
  const { activeSucursalId } = useSucursal();

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm font-['Space_Grotesk']">
        Inicia sesión para administrar los enlaces de menú.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
      {/* Page Header */}
      <div className="px-6 py-5 border-b border-border bg-card/60 backdrop-blur-sm shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold font-['Space_Grotesk'] tracking-tight text-foreground">
          Links de menú
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Administra los enlaces de menú digital públicos y corporativos, horarios semanales y extras.
        </p>
      </div>

      {/* Main List Container */}
      <MenuLinksList tenantId={tenantId} sucursalId={activeSucursalId} />
    </div>
  );
}
