import React from "react";
import { useAuth } from "../../shared/hooks/useAuth";
import { canUseFeature, type Feature } from "../../shared/lib/planFeatures";

interface FeatureGuardProps {
  feature: Feature;
  children: React.ReactNode;
}

const PLAN_UPGRADE_WHATSAPP_URL =
  "https://wa.me/18095968986?text=quiero%20subir%20de%20plan%20por%20favor";

export function FeatureGuard({ feature, children }: FeatureGuardProps) {
  const { plan, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0c0c0c] py-20">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px]">
          Verificando permisos de plan...
        </span>
      </div>
    );
  }

  const allowed = canUseFeature(plan, feature);

  if (!allowed) {

    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-[#0c0c0c] text-white min-h-[400px]">
        <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[20px] shadow-[0px_0px_40px_rgba(255,144,109,0.2)] max-w-[420px] w-full p-8 relative overflow-hidden text-center flex flex-col items-center gap-6">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,144,109,0.08),transparent)] pointer-events-none" />

          {/* Crown Icon */}
          <div className="bg-[rgba(255,144,109,0.12)] border border-[rgba(255,144,109,0.3)] rounded-full size-[64px] flex items-center justify-center shadow-[0_0_20px_rgba(255,144,109,0.2)] z-10">
            <svg className="size-[28px] text-[#ff906d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
              <path d="M3 20h18" />
            </svg>
          </div>

          <div className="flex flex-col gap-1 z-10">
            <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px] uppercase tracking-[0.5px]">
              Función Exclusiva
            </h3>
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[11px] uppercase tracking-[1.5px]">
              Plan Superior Requerido
            </span>
          </div>

          <p className="font-['Inter',sans-serif] text-[#adaaaa] text-[13.5px] leading-relaxed z-10">
            Para acceder a esta opción se necesita un plan mayor al actual. Mejorá tu cuenta para habilitar todas las herramientas de gestión avanzada.
          </p>

          <button
            type="button"
            onClick={() => window.open(PLAN_UPGRADE_WHATSAPP_URL, "_blank", "noopener,noreferrer")}
            className="w-full bg-[#25d366] py-3.5 rounded-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#062d1b] text-[12.5px] uppercase tracking-[0.5px] cursor-pointer border-none transition-all duration-300 hover:shadow-[0_0_20px_rgba(37,211,102,0.35)] hover:scale-[1.01] active:scale-95 z-10"
            style={{ backgroundImage: "linear-gradient(172.248deg, rgb(37, 211, 102) 0%, rgb(18, 140, 126) 100%)" }}
          >
            Subir de Plan por WhatsApp
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
