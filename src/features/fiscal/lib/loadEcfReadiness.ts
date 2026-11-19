import { supabase } from "../../../shared/lib/supabase";
import { NCF_E_TIPO_OPCIONES } from "../../../shared/lib/ncf";
import { issuerInputFromTenantRow } from "../../../shared/lib/ecfIssuerRequirements";
import { evaluateEcfActivationReadiness, type EcfReadinessResult } from "../../../shared/lib/ecfActivationReadiness";

export interface LoadedEcfReadiness {
  result: EcfReadinessResult;
}

/**
 * Reads the persisted state the readiness decision needs (issuer, ranges, certificate metadata for
 * the selected environment) and evaluates it. Shared by the wizard and Ajustes. Read errors are
 * treated as "not ready" with an explanatory issue, never as ready.
 */
export async function loadEcfActivationReadiness(args: {
  tenantId: string;
  plan: string | null | undefined;
  environment: string;
}): Promise<LoadedEcfReadiness> {
  const { tenantId, plan, environment } = args;
  const [tenantRes, boundsRes, representativeRes, certRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("rnc, nombre_negocio, direccion, ncf_secuencias_por_tipo, ecf_issuer_sucursal, ecf_issuer_municipio, ecf_issuer_provincia, ecf_issuer_actividad_economica, ecf_issuer_correo_emisor")
      .eq("id", tenantId)
      .maybeSingle(),
    // Separate query: a missing column must not block the rest (legacy fallback applies).
    Promise.resolve(supabase.from("tenants").select("ecf_secuencias_rangos").eq("id", tenantId).maybeSingle()).catch(() => null),
    // Optional representative cedula; a missing column (migration not applied yet) just means "not set".
    Promise.resolve(supabase.from("tenants").select("ecf_representative_id").eq("id", tenantId).maybeSingle()).catch(() => null),
    supabase
      .from("ecf_certificate_metadata")
      .select("subject, valid_until, is_ready, environment, last_validation_error")
      .eq("tenant_id", tenantId)
      .eq("environment", environment)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (tenantRes.error || !tenantRes.data) {
    return {
      result: {
        ready: false,
        missing: [{ code: "ISSUER", message: "No se pudieron leer los datos fiscales del negocio. Verificá tu conexión e intentá de nuevo." }],
      },
    };
  }
  if (certRes.error) {
    return {
      result: {
        ready: false,
        missing: [{ code: "CERTIFICATE", message: "No se pudo consultar el certificado digital. Verificá tu conexión e intentá de nuevo." }],
      },
    };
  }

  const boundsRaw = boundsRes && !boundsRes.error ? boundsRes.data?.ecf_secuencias_rangos ?? null : null;
  const result = evaluateEcfActivationReadiness({
    plan,
    environment,
    issuer: issuerInputFromTenantRow(tenantRes.data),
    certificate: certRes.data ?? null,
    representativeId: representativeRes && !representativeRes.error ? representativeRes.data?.ecf_representative_id ?? null : null,
    sequencesNextRaw: tenantRes.data.ncf_secuencias_por_tipo,
    sequencesBoundsRaw: boundsRaw,
    ecfTypeCodes: NCF_E_TIPO_OPCIONES.map((type) => type.codigo),
  });
  return { result };
}
