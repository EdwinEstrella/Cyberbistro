import { useAuth } from "../../shared/hooks/useAuth";
import { useSucursal } from "../../app/context/SucursalContext";
import { isPlanAtLeast } from "../../shared/lib/planFeatures";
import { PublicMenuAdminCard } from "../digital-menu/components/PublicMenuAdminCard";
import { MenuLinksList } from "./components/MenuLinksList";

const PLAN_UPGRADE_WHATSAPP_URL =
  "https://wa.me/18095968986?text=quiero%20subir%20de%20plan%20por%20favor";

export function MenuLinksPage() {
  const { tenantId, plan } = useAuth();
  const { activeSucursalId } = useSucursal();

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm font-['Space_Grotesk'] p-8">
        Inicia sesión para administrar el menú digital.
      </div>
    );
  }

  const canUseCompanyLinks = isPlanAtLeast(plan, "empresarial");

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-y-auto">
      {/* Page Header */}
      <div className="px-6 py-5 border-b border-border bg-card/60 backdrop-blur-sm shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold font-['Space_Grotesk'] tracking-tight text-foreground">
          Menú digital
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Administra el menú público del restaurante y los enlaces corporativos para empresas.
        </p>
      </div>

      {/* Main Container with Both Sections */}
      <div className="p-4 sm:p-6 lg:p-8 space-y-10 max-w-7xl mx-auto w-full">
        {/* Section 1: Menú público (Profesional+) */}
        <section aria-labelledby="public-menu-heading" className="space-y-3">
          <PublicMenuAdminCard tenantId={tenantId} sucursalId={activeSucursalId} />
        </section>

        {/* Section 2: Links de empresa */}
        <section aria-labelledby="company-links-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="company-links-heading"
                  className="text-lg sm:text-xl font-bold font-['Space_Grotesk'] text-foreground tracking-tight"
                >
                  Links de empresa
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Empresarial+
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enlaces corporativos asignados a clientes con horarios, control de empleados y límites de crédito.
              </p>
            </div>
          </div>

          {canUseCompanyLinks ? (
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <MenuLinksList tenantId={tenantId} sucursalId={activeSucursalId} />
            </div>
          ) : (
            /* Locked upsell for Profesional plan */
            <div className="rounded-2xl border border-border bg-card p-8 sm:p-12 flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,144,109,0.06),transparent)] pointer-events-none" />

              <div className="bg-[rgba(255,144,109,0.12)] border border-[rgba(255,144,109,0.3)] rounded-full size-16 flex items-center justify-center shadow-[0_0_20px_rgba(255,144,109,0.15)] mb-4">
                <svg
                  className="size-7 text-[#ff906d]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
                  <path d="M3 20h18" />
                </svg>
              </div>

              <div className="flex flex-col gap-1 mb-3">
                <h3 className="font-['Space_Grotesk'] font-bold text-foreground text-lg uppercase tracking-wider">
                  Función Exclusiva
                </h3>
                <span className="font-['Space_Grotesk'] font-bold text-[#ff906d] text-xs uppercase tracking-widest">
                  Plan Empresarial Requerido
                </span>
              </div>

              <p className="text-muted-foreground text-xs sm:text-sm max-w-md leading-relaxed mb-6">
                Los enlaces corporativos para empresas con asignación de clientes, control de empleados autorizados y límites de crédito están disponibles a partir del plan Empresarial.
              </p>

              <button
                type="button"
                onClick={() =>
                  window.open(PLAN_UPGRADE_WHATSAPP_URL, "_blank", "noopener,noreferrer")
                }
                className="bg-[#25d366] hover:bg-[#20ba5a] text-[#062d1b] px-6 py-3 rounded-xl font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider transition-all shadow-md hover:scale-[1.02] active:scale-95 cursor-pointer border-none"
              >
                Subir a Plan Empresarial por WhatsApp
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
