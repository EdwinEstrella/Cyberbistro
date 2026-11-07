import { useSearchParams } from "react-router";
import { useAuth } from "../../../shared/hooks/useAuth";
import { normalizeTenantRol } from "../../../shared/lib/roleNav";
import { canUseFeature } from "../../../shared/lib/planFeatures";
import { Tabs, TabsContent } from "../../../shared/ui/tabs";
import { SectionTabsList, SectionTabsTrigger } from "../../../shared/ui/SectionTabs";
import { FeatureGuard } from "../../../app/components/FeatureGuard";
import { HistorialSyncTab } from "./HistorialSyncTab";
import { FiscalPanel } from "../../fiscal/components/FiscalPanel";

export function HistorialSync() {
  const { rol, plan } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const normalizedRol = normalizeTenantRol(rol);
  const isAdmin = normalizedRol === "admin";
  const canSeeFiscal = canUseFeature(plan, "dgii_ecf");

  const tabParam = searchParams.get("tab");

  // Determine active tab:
  // Non-admins only have access to "fiscal".
  // Admins default to "sincronizacion" unless tab=fiscal is explicitly requested.
  let activeTab = "sincronizacion";
  if (!isAdmin) {
    activeTab = "fiscal";
  } else if (tabParam === "fiscal" && canSeeFiscal) {
    activeTab = "fiscal";
  }

  function handleTabChange(nextTab: string) {
    if (!isAdmin && nextTab !== "fiscal") return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextTab === "sincronizacion") {
          next.delete("tab");
        } else {
          next.set("tab", nextTab);
        }
        return next;
      },
      { replace: true }
    );
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8 lg:p-10 overflow-y-auto min-h-0 text-foreground">
      <div className="max-w-[1500px] mx-auto flex flex-col gap-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border shrink-0">
            <div>
              <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] uppercase tracking-[0.5px]">
                Auditoría y Registros
              </span>
              <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[24px] uppercase tracking-[0.5px] mt-0.5">
                Historial
              </h1>
            </div>

            <SectionTabsList>
              {isAdmin && (
                <SectionTabsTrigger value="sincronizacion">
                  Sincronización
                </SectionTabsTrigger>
              )}
              {canSeeFiscal && (
                <SectionTabsTrigger value="fiscal">
                  Documentos fiscales
                </SectionTabsTrigger>
              )}
            </SectionTabsList>
          </div>

          {isAdmin && (
            <TabsContent value="sincronizacion" className="outline-none">
              <HistorialSyncTab />
            </TabsContent>
          )}

          <TabsContent value="fiscal" className="outline-none">
            <FeatureGuard feature="dgii_ecf">
              <FiscalPanel embedded />
            </FeatureGuard>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
