import { type MouseEvent, useEffect, useState } from "react";
import { AlertTriangle, Award, Building2, Check, CheckCircle, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, ExternalLink, FileKey2, FileText, Hash, ListOrdered, Rocket, ShieldCheck, Wifi, X } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { supabase } from "../../../shared/lib/supabase";
import { NCF_E_TIPO_OPCIONES } from "../../../shared/lib/ncf";
import { CertificateUploader } from "../../ajustes/components/CertificateUploader";
import { enqueueLocalWrite, getDeviceId } from "../../../shared/lib/localFirst";
import { buildIssuerUpdatePayload, buildRepresentativeIdPayload, validateEcfIssuer, validateRepresentativeId, type EcfIssuerInput } from "../../../shared/lib/ecfIssuerRequirements";
import { buildRangesSavePayload, restoreRanges, validateEcfRange } from "../../../shared/lib/ecfSequenceRanges";
import {
  buildActivationPayload,
  buildDeactivationPayload,
  activationNotice,
  formatReadinessIssues,
  type EcfReadinessResult,
} from "../../../shared/lib/ecfActivationReadiness";
import { loadEcfActivationReadiness } from "../lib/loadEcfReadiness";
import { buildReceptorUrls } from "../lib/receptorUrls";
import {
  advanceProgress,
  buildProgressUpsert,
  CERTIFICATION_TOTAL_STEPS,
  displayStepNumber,
  nextVisibleStep,
  restoreProgress,
  visibleCertificationSteps,
  type CertificationProgress,
} from "../lib/ecfCertificationProgress";
import { certificationStepEvidence, loadReceivedEvidence, summarizeReceivedEvidence, type ReceivedEvidenceClient, type ReceivedEvidenceResult } from "../lib/ecfReceivedEvidence";
import { ReceivedEvidencePanel, approvalRows, documentRows } from "./ReceivedEvidencePanel";
import { DocumentSigner } from "./DocumentSigner";
import { EcfTestSendCard } from "./EcfTestSendCard";
import { PrintedRepresentationRunner } from "./PrintedRepresentationRunner";
import { TestSetRunner } from "./TestSetRunner";
import { ReceptorUrlFields } from "./ReceptorUrlFields";

type EcfEnvironment = "test" | "certification" | "production";

const WIZARD_STEP = {
  company: 1,
  certification: 2,
  environment: 3,
  sequences: 4,
  activation: 5,
} as const;

const steps = [
  { id: WIZARD_STEP.company, label: "Datos de la empresa", icon: Building2 },
  { id: WIZARD_STEP.certification, label: "Certificación DGII", icon: ShieldCheck },
  { id: WIZARD_STEP.environment, label: "Ambiente y certificado", icon: FileKey2 },
  { id: WIZARD_STEP.sequences, label: "Secuencias e-CF", icon: ListOrdered },
  { id: WIZARD_STEP.activation, label: "Activación", icon: Rocket },
] as const;

const environments: Array<{ id: EcfEnvironment; title: string; caption: string }> = [
  { id: "test", title: "Pruebas (TesteCF)", caption: "Set de pruebas de la DGII para empezar aquí." },
  { id: "certification", title: "Certificación (CerteCF)", caption: "Proceso de certificación con la DGII." },
  { id: "production", title: "Producción (e-CF)", caption: "Emisión real, requiere estar certificado." },
];

const allCertificationSteps: readonly { id: number; label: string }[] = [
  { id: 1, label: "URLs y XML de Postulación" },
  { id: 2, label: "Set de Pruebas ECF y RFCE" },
  { id: 3, label: "Aprobación Comercial (ACEFC)" },
  { id: 4, label: "Pruebas de Simulación e-CF" },
  { id: 5, label: "Representación Impresa" },
  { id: 6, label: "Validación por la DGII" },
  { id: 7, label: "Registro de URLs de Prueba" },
  { id: 8, label: "Recepción de e-CF (Prueba)" },
  { id: 9, label: "Recepción de RFCE (Prueba)" },
  { id: 10, label: "Recepción de ACECF (Prueba)" },
  { id: 11, label: "Recepción de Notas (Prueba)" },
  { id: 12, label: "Registro de URLs de Producción" },
  { id: 13, label: "Declaración Jurada" },
  { id: 14, label: "Verificación de Estatus" },
  { id: 15, label: "Certificación Completada" },
];

const visibleStepIds = new Set(visibleCertificationSteps());
const certificationSteps = allCertificationSteps.filter((step) => visibleStepIds.has(step.id));
const certificationStepMap = new Map(allCertificationSteps.map((s) => [s.id, s.label]));

const certificationPortalUrl = "https://ecf.dgii.gov.do/certecf/portalcertificacion/Login?ReturnUrl=%2Fcertecf%2Fportalcertificacion";

export function ActivationPanel({ onNavigateToGeneral }: { onNavigateToGeneral: () => void }) {
  const { tenantId, plan, user } = useAuth();
  const [step, setStep] = useState<number>(WIZARD_STEP.company);
  const [environment, setEnvironment] = useState<EcfEnvironment>("test");
  const [company, setCompany] = useState({
    name: "", rnc: "", phone: "", email: "", address: "", sucursal: "", municipio: "", provincia: "", actividad: "", issuerEmail: "", representativeId: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [ecfSequences, setEcfSequences] = useState<Record<string, { start: number; end: number; used: number }>>({
    E31: { start: 1, end: 1000, used: 0 },
    E32: { start: 1, end: 1000, used: 0 }
  });
  const [enabledTypes, setEnabledTypes] = useState<string[]>(["E31", "E32"]);
  const [certificateReady, setCertificateReady] = useState(false);
  const [fiscalActive, setFiscalActive] = useState(false);
  const [fiscalMode, setFiscalMode] = useState<string | null>(null);
  const [showActivationNotice, setShowActivationNotice] = useState(false);
  const [certificationStep, setCertificationStep] = useState(1);
  const [completedCertificationSteps, setCompletedCertificationSteps] = useState<number[]>([]);
  const [savedNextRaw, setSavedNextRaw] = useState<unknown>({});
  const [savedBoundsRaw, setSavedBoundsRaw] = useState<unknown>({});
  const [readiness, setReadiness] = useState<EcfReadinessResult | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [receivedEvidence, setReceivedEvidence] = useState<ReceivedEvidenceResult>({ docs: [], approvals: [], error: null });
  const [receivedLoading, setReceivedLoading] = useState(false);

  const issuerInput: EcfIssuerInput = {
    rnc: company.rnc,
    nombre: company.name,
    direccion: company.address,
    sucursal: company.sucursal,
    municipio: company.municipio,
    provincia: company.provincia,
    actividadEconomica: company.actividad,
    correoEmisor: company.issuerEmail,
  };
  const issuerValidation = validateEcfIssuer(issuerInput);
  const contactMissing = [!company.phone.trim() && "teléfono", !company.email.trim() && "correo electrónico"].filter(Boolean) as string[];
  const companyReady = issuerValidation.complete && contactMissing.length === 0;
  const receptorUrls = buildReceptorUrls(company.rnc);

  useEffect(() => {
    if (!tenantId) return;

    // Range bounds live in a separate column; a failure here (e.g. column not deployed yet) must
    // not block loading the rest of the company data, so it is read apart and errors are ignored.
    const boundsPromise = Promise.resolve(
      supabase.from("tenants").select("ecf_secuencias_rangos").eq("id", tenantId).maybeSingle()
    ).then(({ data, error }) => (error ? null : (data?.ecf_secuencias_rangos ?? null))).catch(() => null);

    // Optional representative cedula, read apart so a not-yet-deployed column cannot block the form.
    const representativePromise = Promise.resolve(
      supabase.from("tenants").select("ecf_representative_id").eq("id", tenantId).maybeSingle()
    ).then(({ data, error }) => (error ? "" : (data?.ecf_representative_id ?? ""))).catch(() => "");

    void supabase
      .from("tenants")
        .select("nombre_negocio, rnc, telefono, email, direccion, ecf_environment, ncf_secuencias_por_tipo, fiscal_mode, ecf_issuer_sucursal, ecf_issuer_municipio, ecf_issuer_provincia, ecf_issuer_actividad_economica, ecf_issuer_correo_emisor")
      .eq("id", tenantId)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (error || !data) return;
        const bounds = await boundsPromise;
        const representativeId = await representativePromise;
        setCompany({
          name: data.nombre_negocio ?? "",
          rnc: data.rnc ?? "",
          phone: data.telefono ?? "",
          email: data.email ?? "",
          address: data.direccion ?? "",
          sucursal: data.ecf_issuer_sucursal ?? "",
          municipio: data.ecf_issuer_municipio ?? "",
          provincia: data.ecf_issuer_provincia ?? "",
          actividad: data.ecf_issuer_actividad_economica ?? "",
          issuerEmail: data.ecf_issuer_correo_emisor ?? data.email ?? "",
          representativeId,
        });
        setFiscalActive(data.fiscal_mode === "dgii_ecf");
        setFiscalMode(typeof data.fiscal_mode === "string" ? data.fiscal_mode : null);
        setSavedNextRaw(data.ncf_secuencias_por_tipo ?? {});
        setSavedBoundsRaw(bounds ?? {});
        const fiscalSequences = restoreRanges(NCF_E_TIPO_OPCIONES.map((type) => type.codigo), data.ncf_secuencias_por_tipo, bounds);
        if (Object.keys(fiscalSequences).length > 0) {
          setEcfSequences(fiscalSequences);
          setEnabledTypes(Object.keys(fiscalSequences));
        }
        if (["test", "certification", "production"].includes(data.ecf_environment)) {
          setEnvironment(data.ecf_environment as EcfEnvironment);
        }
      });
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;

    void supabase
      .from("ecf_certificate_metadata")
      .select("is_ready")
      .eq("tenant_id", tenantId)
      .eq("environment", environment)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setCertificateReady(Boolean(data?.is_ready)));
  }, [tenantId, environment]);

  // Certification progress is cloud-only (not local-first). Any failure keeps the wizard on step 1.
  useEffect(() => {
    if (!tenantId) return;
    void Promise.resolve(
      supabase.from("ecf_certification_progress").select("current_step, completed_steps").eq("tenant_id", tenantId).maybeSingle()
    ).then(({ data, error }) => {
      if (error || !data) return;
      const restored = restoreProgress(data);
      setCertificationStep(restored.currentStep);
      setCompletedCertificationSteps(restored.completedSteps);
    }).catch(() => undefined);
  }, [tenantId]);

  function persistCertificationProgress(progress: CertificationProgress) {
    if (!tenantId) return;
    void Promise.resolve(
      supabase.from("ecf_certification_progress").upsert(
        buildProgressUpsert({ tenantId, environment, progress, userId: user?.id }),
        { onConflict: "tenant_id" }
      )
    ).catch(() => undefined);
  }

  async function refreshReceivedEvidence() {
    if (!tenantId) return;
    setReceivedLoading(true);
    const result = await loadReceivedEvidence(supabase as unknown as ReceivedEvidenceClient, tenantId);
    setReceivedEvidence(result);
    setReceivedLoading(false);
  }

  useEffect(() => {
    if (!tenantId || certificationStep < 8 || certificationStep > 11) return;
    let cancelled = false;
    const load = async () => {
      const result = await loadReceivedEvidence(supabase as unknown as ReceivedEvidenceClient, tenantId);
      if (!cancelled) setReceivedEvidence(result);
    };
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tenantId, certificationStep]);

  const stepEvidence = certificationStepEvidence(certificationStep, summarizeReceivedEvidence(receivedEvidence.docs, receivedEvidence.approvals));
  const stepEvidenceCount = certificationStep <= 9 ? summarizeReceivedEvidence(receivedEvidence.docs, []).acceptedDocuments : receivedEvidence.approvals.length;
  const advanceBlocked = stepEvidence.applies && !stepEvidence.satisfied;

  function goToCertificationStep(step: number) {
    setCertificationStep(step);
    persistCertificationProgress({ currentStep: step, completedSteps: completedCertificationSteps });
  }

  function advanceCertificationStep() {
    const next = advanceProgress({ currentStep: certificationStep, completedSteps: completedCertificationSteps }, certificationStep);
    setCertificationStep(next.currentStep);
    setCompletedCertificationSteps(next.completedSteps);
    persistCertificationProgress(next);
  }

  async function saveCompany() {
    if (!tenantId) return;
    const representativeValidation = validateRepresentativeId(company.representativeId);
    const problems = [issuerValidation.message, representativeValidation.message, contactMissing.length > 0 ? `Falta completar: ${contactMissing.join(", ")}.` : ""].filter(Boolean);
    if (problems.length > 0) {
      setMessage(problems.join(" "));
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await enqueueLocalWrite({
        tenantId,
        tableName: "tenants",
        rowId: tenantId,
        op: "update",
        payload: {
          ...buildIssuerUpdatePayload(issuerInput),
          ...buildRepresentativeIdPayload(company.representativeId),
          email: company.email.trim() || null,
          updated_at: new Date().toISOString(),
        },
        deviceId: await getDeviceId(),
      });
      setStep(WIZARD_STEP.certification);
      setMessage("Datos fiscales del emisor guardados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron guardar los datos fiscales.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEnvironment() {
    if (!tenantId) return;
    setSaving(true);
    setMessage("");
    try {
      await enqueueLocalWrite({
        tenantId,
        tableName: "tenants",
        rowId: tenantId,
        op: "update",
        payload: { ecf_environment: environment, updated_at: new Date().toISOString() },
        deviceId: await getDeviceId(),
      });
      setStep(WIZARD_STEP.sequences);
      setMessage(`Ambiente ${environments.find((item) => item.id === environment)?.title} guardado.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el ambiente DGII.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSequences() {
    if (!tenantId || enabledTypes.length === 0) return;
    const errors = enabledTypes.flatMap((type) => validateEcfRange(type, ecfSequences[type] ?? { start: 0, end: 0, used: 0 }).errors);
    if (errors.length > 0) {
      setMessage(errors.join(" "));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const deviceId = await getDeviceId();
      const payload = buildRangesSavePayload(
        enabledTypes,
        ecfSequences,
        savedNextRaw,
        savedBoundsRaw,
        NCF_E_TIPO_OPCIONES.map((type) => type.codigo)
      );
      // Two writes on purpose: the next-number map is what the POS and reserve RPC read; the range
      // bounds are separate so a deploy lag on that column can never block the counters.
      await enqueueLocalWrite({
        tenantId,
        tableName: "tenants",
        rowId: tenantId,
        op: "update",
        payload: { ncf_secuencias_por_tipo: payload.ncf_secuencias_por_tipo, updated_at: new Date().toISOString() },
        deviceId,
      });
      await enqueueLocalWrite({
        tenantId,
        tableName: "tenants",
        rowId: tenantId,
        op: "update",
        payload: { ecf_secuencias_rangos: payload.ecf_secuencias_rangos, updated_at: new Date().toISOString() },
        deviceId,
      });
      setSavedNextRaw(payload.ncf_secuencias_por_tipo);
      setSavedBoundsRaw(payload.ecf_secuencias_rangos);
      if (payload.keptTypes.length > 0) setEnabledTypes((current) => [...current, ...payload.keptTypes]);
      setStep(WIZARD_STEP.activation);
      const warnings = enabledTypes.flatMap((type) => validateEcfRange(type, ecfSequences[type]).warnings);
      if (payload.keptTypes.length > 0) {
        warnings.push(
          `No se quitaron ${payload.keptTypes.join(", ")}: ya se emitieron comprobantes de esos tipos y quitarlos permitiría repetir números.`
        );
      }
      setMessage(["Secuencias e-CF guardadas.", ...warnings].join(" "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron guardar las secuencias e-CF.");
    } finally {
      setSaving(false);
    }
  }

  function toggleType(type: string) {
    setEnabledTypes((current) => {
      if (current.includes(type)) return current.filter((item) => item !== type);
      return [...current, type];
    });
    setEcfSequences((current) => ({ ...current, [type]: current[type] || { start: 1, end: 1000, used: 0 } }));
  }

  async function refreshReadiness() {
    if (!tenantId) return null;
    setReadinessLoading(true);
    try {
      const loaded = await loadEcfActivationReadiness({ tenantId, plan, environment });
      setReadiness(loaded.result);
      return loaded;
    } finally {
      setReadinessLoading(false);
    }
  }

  // Re-check the persisted state whenever the activation step is shown or the environment changes.
  useEffect(() => {
    if (step !== WIZARD_STEP.activation) return;
    void refreshReadiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, environment, tenantId, plan, certificateReady]);

  async function activateElectronicBilling() {
    if (!tenantId) return;
    setSaving(true);
    setMessage("");
    try {
      // Same shared check as Ajustes, re-read from persisted data right before writing.
      const loaded = await refreshReadiness();
      if (!loaded || !loaded.result.ready) {
        setMessage(loaded ? formatReadinessIssues(loaded.result) : "No se pudo verificar la configuración.");
        return;
      }
      await enqueueLocalWrite({
        tenantId,
        tableName: "tenants",
        rowId: tenantId,
        op: "update",
        payload: buildActivationPayload(environment),
        deviceId: await getDeviceId(),
      });
      setFiscalActive(true);
      setFiscalMode("dgii_ecf");
      setStep(WIZARD_STEP.certification);
      setShowActivationNotice(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo activar la facturación electrónica.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateElectronicBilling() {
    if (!tenantId) return;
    setSaving(true);
    setMessage("");
    try {
      const loaded = await refreshReadiness();
      const deactivation = buildDeactivationPayload(loaded?.fiscalModeFallback);
      await enqueueLocalWrite({
        tenantId,
        tableName: "tenants",
        rowId: tenantId,
        op: "update",
        payload: deactivation,
        deviceId: await getDeviceId(),
      });
      setFiscalActive(false);
      setFiscalMode(deactivation.fiscal_mode);
      setShowActivationNotice(false);
      setMessage("Facturación electrónica desactivada. El POS vuelve al modo fiscal de respaldo configurado en Ajustes.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo desactivar la facturación electrónica.");
    } finally {
      setSaving(false);
    }
  }

  async function verifyConfiguration() {
    const loaded = await refreshReadiness();
    if (!loaded) return;
    setMessage(loaded.result.ready
      ? "La configuración está completa y lista para activar la facturación electrónica."
      : formatReadinessIssues(loaded.result));
  }

  function openCertificationPortal(event?: MouseEvent<HTMLElement>) {
    if (event) event.preventDefault();
    if (window.electronAPI?.openCertificationPortal) {
      void window.electronAPI.openCertificationPortal();
      return;
    }
    window.open(certificationPortalUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background p-4 sm:p-8">
      <div className="w-full">
        <header className="mb-7 flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <FileKey2 className="size-6" />
          </div>
          <div>
            <h1 className="font-['Space_Grotesk',sans-serif] text-2xl font-bold text-foreground sm:text-3xl">Activación e-CF</h1>
            <p className="mt-1 text-sm text-muted-foreground">Configurá el ambiente DGII y prepará tu negocio para emitir comprobantes electrónicos.</p>
          </div>
        </header>

        <div className="mb-7 flex items-center overflow-x-auto rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
          {steps.map((item, index) => {
            const Icon = item.icon;
            const completed = item.id < step;
            const current = item.id === step;
            return (
              <div key={item.label} className="flex min-w-fit items-center">
                <button
                  type="button"
                  onClick={() => setStep(item.id)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                    current ? "bg-primary text-primary-foreground shadow-sm" : completed ? "text-primary" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span className={`flex size-5 items-center justify-center rounded-full border ${current ? "border-primary-foreground/40" : completed ? "border-primary bg-primary/10" : "border-border"}`}>
                    {completed ? <Check className="size-3" /> : <Icon className="size-3" />}
                  </span>
                  <span className="font-bold">{item.label}</span>
                </button>
                {index < steps.length - 1 && <div className="mx-1 h-px w-8 bg-border sm:w-12" />}
              </div>
            );
          })}
        </div>

        <section className="rounded-[24px] border border-border bg-card p-5 shadow-sm sm:p-7">
          {step === WIZARD_STEP.company && (
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Paso {WIZARD_STEP.company}</span>
              <h2 className="mt-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-foreground">Datos de la empresa</h2>
              
              <div className="mt-6 rounded-2xl border border-border bg-muted/20 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-foreground">Datos generales de la empresa</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Nombre comercial, RNC, dirección y teléfono se configuran en la pestaña General.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onNavigateToGeneral}
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg border-none cursor-pointer transition-colors"
                >
                  <ExternalLink className="size-3.5" /> Ir a General
                </button>
              </div>

              <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <CompanyField label="RNC DEL EMISOR" value={company.rnc} readOnly />
                <CompanyField label="RAZÓN SOCIAL" value={company.name} readOnly />
                <CompanyField label="TELÉFONO" value={company.phone} readOnly />
                <CompanyField label="EMAIL FISCAL" value={company.email} type="email" onChange={(email) => setCompany((current) => ({ ...current, email }))} />
                <div className="sm:col-span-2">
                  <CompanyField label="DIRECCIÓN" value={company.address} readOnly />
                </div>
              </div>
              <div className="mt-6 border-t border-border pt-5">
                <h3 className="font-['Space_Grotesk',sans-serif] text-base font-bold text-foreground">Datos técnicos del emisor</h3>
                <p className="mt-1 text-xs text-muted-foreground">La DGII los requiere para construir cada comprobante electrónico. Sin ellos el POS no puede emitir e-CF.</p>
                <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
                  <CompanyField label="SUCURSAL EMISORA" value={company.sucursal} onChange={(sucursal) => setCompany((current) => ({ ...current, sucursal }))} />
                  <CompanyField label="MUNICIPIO" value={company.municipio} onChange={(municipio) => setCompany((current) => ({ ...current, municipio }))} />
                  <CompanyField label="PROVINCIA" value={company.provincia} onChange={(provincia) => setCompany((current) => ({ ...current, provincia }))} />
                  <CompanyField label="ACTIVIDAD ECONÓMICA" value={company.actividad} onChange={(actividad) => setCompany((current) => ({ ...current, actividad }))} />
                  <CompanyField label="CORREO DEL EMISOR E-CF" value={company.issuerEmail} type="email" onChange={(issuerEmail) => setCompany((current) => ({ ...current, issuerEmail }))} />
                  <div className="sm:col-span-2">
                    <CompanyField label="CÉDULA DEL REPRESENTANTE (OPCIONAL)" value={company.representativeId} onChange={(representativeId) => setCompany((current) => ({ ...current, representativeId }))} />
                    <p className="mt-1 text-xs text-muted-foreground">La persona a nombre de quien está el certificado digital; debe ser el representante registrado en la DGII.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === WIZARD_STEP.certification && (
            <div>
              {certificationStep !== 15 && (
                <>
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Paso {WIZARD_STEP.certification}</span>
                  <h2 className="mt-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-foreground">Certificación DGII</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Completá los hitos requeridos antes de solicitar la habilitación para producción.</p>
                </>
              )}

              <div className="mt-6 rounded-2xl border border-border bg-background p-4 sm:p-6">
                <ol className="relative grid items-center" style={{ gridTemplateColumns: `repeat(${certificationSteps.length}, minmax(0, 1fr))` }}>
                  <div className="absolute top-1/2 h-px -translate-y-1/2 bg-border" style={{ left: `${50 / certificationSteps.length}%`, right: `${50 / certificationSteps.length}%` }} aria-hidden="true" />
                  {certificationSteps.map((item) => {
                    const current = item.id === certificationStep;
                    const complete = item.id < certificationStep;
                    const displayNum = displayStepNumber(item.id);
                    return (
                      <li key={item.id} className="relative z-10 flex justify-center">
                        <button type="button" onClick={() => goToCertificationStep(item.id)} title={item.label} aria-label={`Paso ${displayNum}: ${item.label}`} className={`flex size-7 items-center justify-center rounded-full border text-[10px] font-bold transition-transform hover:scale-110 sm:size-8 ${complete ? "border-primary bg-primary text-primary-foreground" : current ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "border-border bg-muted text-muted-foreground"}`}>
                          {complete ? <Check className="size-3" /> : displayNum}
                        </button>
                      </li>
                    );
                  })}
                </ol>

                {certificationStep === 15 ? (
                  <CertificationComplete />
                ) : (
                  <>
                {certificationStep !== 1 && (
                <div className="mt-6 rounded-xl border border-primary/15 bg-primary/5 px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-primary">
                    {certificationStep === 12 ? <Wifi className="size-4" /> : <ShieldCheck className="size-4" />} Paso {displayStepNumber(certificationStep)} - {certificationStepMap.get(certificationStep) ?? ""}
                  </div>
                  {certificationStep === 4 ? (
                    <div className="mt-3">
                      <p className="text-xs leading-relaxed text-muted-foreground">Etapa que comprueba la capacidad de tu sistema para generar y enviar e-CF en XML a la DGII a partir de datos de operaciones reales.</p>
                      <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
                        <li className="flex items-start gap-2"><Hash className="mt-0.5 size-3.5 shrink-0 text-primary" /> <span>Cada tipo de e-CF usa secuencias 1-10,000,000 que <strong className="font-semibold text-foreground">no se reutilizan</strong> entre intentos si un comprobante fue rechazado.</span></li>
                        <li className="flex items-start gap-2"><FileText className="mt-0.5 size-3.5 shrink-0 text-orange-500" /> <span>Cada Factura de Consumo &lt; RD$250,000 envía primero un <strong className="font-semibold text-foreground">Resumen (RFCE)</strong>; tras ser aceptado, se cargan las facturas por esta interfaz.</span></li>
                        <li className="flex items-start gap-2"><CheckCircle className="mt-0.5 size-3.5 shrink-0 text-green-500" /> <span>Por cada e-CF enviado se conserva su <strong className="font-semibold text-foreground">representación impresa</strong> (con QR) usando el botón <strong className="font-semibold text-foreground">Ver - Imprimir</strong>, para el siguiente paso.</span></li>
                      </ul>
                    </div>
                  ) : certificationStep === 5 ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      Descarga la Representación Impresa (PDF con QR) de un comprobante de cada tipo y súbela al portal de certificación. Cada PDF lleva el e-NCF, código de seguridad, fecha de firma y el QR de validación DGII.
                    </p>
                  ) : certificationStep === 6 ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      La DGII está validando los datos enviados. Puede tomar 24 a 72 horas.
                    </p>
                  ) : certificationStep === 8 ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      La DGII enviará e-CF de prueba a tus URLs. Descarga el certificado raíz y presiona "Inicio envío de pruebas" en el portal.
                    </p>
                  ) : certificationStep === 9 ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      La DGII enviará Facturas de Consumo Electrónicas (E32) de prueba. El mismo endpoint de recepción las recibirá automáticamente.
                    </p>
                  ) : certificationStep === 10 ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      Verifica la recepcion de Aprobaciones Comerciales (ACECF) en tu sistema.
                    </p>
                  ) : certificationStep === 11 ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      Verifica la recepcion de Notas de Debito y Credito en tu sistema.
                    </p>
                  ) : certificationStep === 12 ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      Registra tus URLs definitivas en el <button type="button" onClick={openCertificationPortal} className="font-semibold text-primary hover:underline">Portal DGII</button> para el ambiente de producción.
                    </p>
                  ) : certificationStep === 13 ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      Descarga la declaracion jurada desde el portal DGII, sube aqui el XML descargado, el sistema lo firma con tu certificado digital y luego descargas el XML firmado para enviarlo manualmente a la DGII.
                    </p>
                  ) : certificationStep === 14 ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      Consulta el estatus de tu certificacion. Cuando sea aprobada, avanzaras al paso final.
                    </p>
                  ) : (
                    <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                      {certificationStep === 2 ? (
                        <li>Descargá el Set de Pruebas ECF y RFCE desde el portal y preparalo para cargarlo.</li>
                      ) : certificationStep === 3 ? (
                        <li>Descargá el set de datos de Aprobación Comercial (Paso {displayStepNumber(3)}) desde el portal de certificación y cargalo para enviarlo.</li>
                      ) : (
                        <li>Completá y documentá el hito con la DGII antes de avanzar al siguiente paso.</li>
                      )}
                    </ol>
                  )}
                </div>
                )}

                {certificationStep === 1 && (
                  <div className="mt-4 flex flex-col gap-4">
                    <button type="button" onClick={openCertificationPortal} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700">
                      <ExternalLink className="size-4" /> Ir al Portal DGII
                    </button>

                    <ReceptorUrlFields portalField={receptorUrls.portalField} onCopied={setMessage} />

                    <DocumentSigner
                      tenantId={tenantId}
                      environment={environment}
                      documentType="postulacion"
                      title="Firmar postulación XML"
                      helperText="Descargá el XML de postulación desde el portal de la DGII, firmalo aquí con tu certificado y subí el archivo firmado al portal."
                    />
                  </div>
                )}

                {certificationStep === 2 && <TestSetRunner tenantId={tenantId} environment={environment} />}

                {certificationStep === 3 && <TestSetRunner tenantId={tenantId} environment={environment} runType="commercial_approval" />}

                {certificationStep === 4 && <TestSetRunner tenantId={tenantId} environment={environment} runType="simulation" />}

                {certificationStep === 5 && (
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-xs leading-relaxed text-yellow-700 dark:text-yellow-400">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <p>
                        La suma de todos los archivos no puede superar <strong className="font-semibold">10MB</strong> (cada PDF pesa menos de 30KB, sin problema). Es responsabilidad del contribuyente que la representación cumpla la Ley 32-23 y el Formato e-CF.
                      </p>
                    </div>

                    <PrintedRepresentationRunner tenantId={tenantId} environment={environment} />
                  </div>
                )}

                {certificationStep === 6 && (
                  <button type="button" onClick={openCertificationPortal} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700">
                    <ExternalLink className="size-4" /> Verificar en Portal DGII
                  </button>
                )}

                {certificationStep >= 8 && certificationStep <= 11 && (
                  <div className="mt-4 flex flex-col gap-4">
                    <ReceivedEvidencePanel
                      title={certificationStep === 8 ? `e-CF recibidos de DGII (Paso ${displayStepNumber(8)} – Inicio Prueba Recepción e-CF)` : certificationStep === 9 ? `e-CF recibidos (Paso ${displayStepNumber(9)} – Recepción e-CF)` : certificationStep === 10 ? `Aprobaciones comerciales recibidas (Paso ${displayStepNumber(10)} – Inicio Prueba Aprobación Comercial)` : `Aprobaciones comerciales recibidas (Paso ${displayStepNumber(11)} – Recepción Aprobación Comercial)`}
                      rows={certificationStep <= 9 ? documentRows(receivedEvidence.docs) : approvalRows(receivedEvidence.approvals)}
                      loading={receivedLoading}
                      error={receivedEvidence.error}
                      emptyText={certificationStep <= 9 ? "Aún no llegó ningún e-CF. Presioná \"Inicio envío de pruebas\" en el portal DGII para que envíen los comprobantes." : "Aún no llegó ninguna aprobación comercial. Presioná el inicio de la prueba de aprobación comercial en el portal DGII."}
                      onRefresh={() => void refreshReceivedEvidence()}
                    />

                    <button type="button" onClick={openCertificationPortal} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700">
                      <ExternalLink className="size-4" /> {certificationStep === 8 ? "Ir al Portal DGII — Iniciar envío de pruebas" : "Ir al Portal DGII"}
                    </button>
                  </div>
                )}

                {certificationStep === 12 && (
                  <div className="mt-4 flex flex-col gap-4">
                    <ReceptorUrlFields portalField={receptorUrls.portalField} onCopied={setMessage} />

                    <button type="button" onClick={() => setMessage("Configuración de URLs guardada para producción en el diseño.")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1e293b] px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-900">
                      <Wifi className="size-4" /> Guardar configuración de URLs
                    </button>
                    <button type="button" onClick={openCertificationPortal} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-700">
                      <ExternalLink className="size-4" /> Ir al Portal DGII a registrar las URLs
                    </button>
                  </div>
                )}

                {certificationStep === 13 && (
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-xs leading-relaxed text-yellow-700 dark:text-yellow-400">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <p>
                        Para firmar este XML necesitas tener cargado y validado el certificado digital en el Paso {WIZARD_STEP.environment}.
                      </p>
                    </div>

                    <DocumentSigner
                      tenantId={tenantId}
                      environment={environment}
                      documentType="declaracion_jurada"
                      title="Firmar declaración jurada XML"
                      helperText="Descargá la declaración jurada desde el portal de la DGII, firmala aquí con tu certificado digital y subí el archivo firmado al portal. Este paso no envía nada automáticamente."
                    />

                    <button type="button" onClick={openCertificationPortal} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700">
                      <ExternalLink className="size-4" /> Ir al Portal DGII
                    </button>
                  </div>
                )}

                {certificationStep === 14 && (
                  <div className="mt-4 flex flex-col gap-4">
                    <button type="button" onClick={openCertificationPortal} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-green-700">
                      <CheckCircle className="size-4" /> Verificar Estatus de Certificacion
                    </button>
                  </div>
                )}

                <button type="button" onClick={advanceCertificationStep} disabled={certificationStep === CERTIFICATION_TOTAL_STEPS || advanceBlocked} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold transition-colors ${advanceBlocked ? "cursor-not-allowed bg-sky-500/50 text-white shadow-none" : "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"}`}>
                  {certificationStep === CERTIFICATION_TOTAL_STEPS ? "Certificación lista para revisión" : certificationStep === 14 ? "> Marcar como aprobado manualmente" : certificationStep === 13 ? "> XML enviado a DGII — Avanzar" : certificationStep === 12 ? `> URLs registradas — Avanzar al Paso ${displayStepNumber(nextVisibleStep(12))}` : certificationStep >= 8 && certificationStep <= 11 ? (advanceBlocked ? (certificationStep <= 9 ? "> Esperando e-CF de DGII..." : "> Esperando aprobaciones comerciales...") : `Recibidos ${stepEvidenceCount} — Avanzar al Paso ${displayStepNumber(nextVisibleStep(certificationStep))}`) : certificationStep === 6 ? `DGII aprobó — Avanzar al Paso ${displayStepNumber(nextVisibleStep(6))}` : certificationStep === 5 ? "Representaciones subidas — Avanzar" : `Ya completé este paso - Avanzar al paso ${displayStepNumber(nextVisibleStep(certificationStep))}`} {!advanceBlocked && certificationStep !== 14 && certificationStep !== 13 && certificationStep !== 12 && certificationStep !== CERTIFICATION_TOTAL_STEPS && <ChevronRight className="size-4" />}
                </button>
                  </>
                )}
              </div>
            </div>
          )}

          {step === WIZARD_STEP.environment && (
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Paso {WIZARD_STEP.environment}</span>
              <h2 className="mt-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-foreground">Ambiente de la DGII</h2>
              <p className="mt-2 text-sm text-muted-foreground">Elegí dónde vas a operar antes de cargar y validar el certificado digital.</p>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {environments.map((item) => {
                  const selected = environment === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setEnvironment(item.id)}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        selected ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]" : "border-border bg-background hover:border-primary/40"
                      }`}
                    >
                      <span className="block font-['Space_Grotesk',sans-serif] text-sm font-bold text-foreground">{item.title}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.caption}</span>
                    </button>
                  );
                })}
              </div>

              <CertificateUploader environment={environment} onValidated={() => setCertificateReady(true)} />
              {environment === "test" && <EcfTestSendCard tenantId={tenantId} certificateReady={certificateReady} />}
            </div>
          )}

          {step === WIZARD_STEP.sequences && (
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Paso {WIZARD_STEP.sequences}</span>
              <h2 className="mt-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-foreground">Secuencias e-CF</h2>
              <p className="mt-2 text-sm text-muted-foreground">Agrega varios tipos de comprobante a la vez con sus rangos autorizados por la DGII. El sistema lleva la cuenta de cuántos te quedan de cada uno.</p>

              <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:p-5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">+ AGREGAR TIPO DE COMPROBANTE</span>
                <div className="mt-4 flex flex-wrap gap-2">
                  {NCF_E_TIPO_OPCIONES.map((type) => {
                    const enabled = enabledTypes.includes(type.codigo);
                    return (
                      <button
                        key={type.codigo}
                        type="button"
                        onClick={() => toggleType(type.codigo)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                          enabled ? "border-primary/20 bg-background text-primary/40 opacity-70" : "border-border bg-background text-primary hover:border-primary hover:bg-primary/5"
                        }`}
                      >
                        {enabled ? "✓ " : "+ "}{type.codigo}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                {NCF_E_TIPO_OPCIONES.filter((type) => enabledTypes.includes(type.codigo)).map((type) => {
                  const seq = ecfSequences[type.codigo] || { start: 1, end: 1000, used: 0 };
                  const next = seq.start + seq.used;
                  const remaining = Math.max(0, seq.end - next + 1);
                  const total = Math.max(1, seq.end - seq.start + 1);
                  const progress = Math.min(100, Math.max(0, (seq.used / total) * 100));
                  const rangeCheck = validateEcfRange(type.codigo, seq);

                  return (
                    <div key={type.codigo} className="relative rounded-2xl border border-border bg-background px-5 py-4 shadow-sm transition-all hover:border-primary/30">
                      <button type="button" onClick={() => toggleType(type.codigo)} className="absolute right-4 top-4 text-muted-foreground hover:text-destructive">
                        <X className="size-4" />
                      </button>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                        <div className="flex flex-1 items-center gap-3">
                          <span className="rounded-lg bg-primary px-2.5 py-1.5 font-mono text-xs font-bold text-primary-foreground">{type.codigo}</span>
                          <span className="font-['Space_Grotesk',sans-serif] text-sm font-bold text-foreground">{type.descripcion.replace(`${type.codigo} - `, "")}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-muted-foreground lg:pr-8">
                          <label className="flex items-center gap-2">Desde <input type="number" value={seq.start} onChange={(e) => setEcfSequences(s => ({...s, [type.codigo]: {...(s[type.codigo] || { start: 1, end: 1000, used: 0 }), start: Math.max(1, Number(e.target.value) || 1)}}))} className="w-24 rounded-lg border border-border px-2 py-1.5 text-foreground outline-none focus:border-primary" /></label>
                          <label className="flex items-center gap-2">Hasta <input type="number" value={seq.end} onChange={(e) => setEcfSequences(s => ({...s, [type.codigo]: {...(s[type.codigo] || { start: 1, end: 1000, used: 0 }), end: Math.max(1, Number(e.target.value) || 1)}}))} className="w-24 rounded-lg border border-border px-2 py-1.5 text-foreground outline-none focus:border-primary" /></label>
                          <label className="flex items-center gap-2">Usados <input type="number" value={seq.used} readOnly className="w-20 rounded-lg border border-border bg-muted/50 px-2 py-1.5 text-muted-foreground outline-none" /></label>
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="mt-2 flex items-center justify-end gap-3 text-[11px]">
                          {rangeCheck.errors.map((text) => <span key={text} className="font-bold text-destructive">{text}</span>)}
                          {rangeCheck.warnings.map((text) => <span key={text} className="font-bold text-yellow-700 dark:text-yellow-300">{text}</span>)}
                          <span className="font-bold text-green-600 dark:text-green-400">{remaining} restantes</span>
                          <span className="text-muted-foreground">próximo: <strong className="font-mono text-foreground">{type.codigo}{String(next).padStart(10, "0")}</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {enabledTypes.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Seleccioná al menos un tipo de comprobante e-CF.</p>}
            </div>
          )}
          {step === WIZARD_STEP.activation && (
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Paso {WIZARD_STEP.activation}</span>
              <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <h2 className="font-['Space_Grotesk',sans-serif] text-2xl font-bold text-foreground">Activación</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Revisá el estado de tu configuración antes de habilitar la emisión electrónica.</p>
                </div>
                <button type="button" onClick={() => void verifyConfiguration()} className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-foreground transition-colors hover:bg-muted">
                  Verificar configuración
                </button>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <ActivationStatus label="Empresa" detail={companyReady ? `${company.name} · ${company.rnc}` : (issuerValidation.message || "Completá los datos fiscales del emisor")} ready={companyReady} />
                <ActivationStatus label="Certificado digital" detail={certificateReady ? "Validado y listo para firmar" : "Pendiente de cargar"} ready={certificateReady} />
                <ActivationStatus label="Secuencias e-CF" detail={enabledTypes.length > 0 ? `${enabledTypes.length} tipo(s) configurado(s)` : "Pendiente de configurar"} ready={enabledTypes.length > 0} />
              </div>

              <div className="mt-5 rounded-2xl border border-border bg-muted/25 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ambiente actual</span>
                    <p className="mt-1 font-['Space_Grotesk',sans-serif] text-lg font-bold text-foreground">{environments.find((item) => item.id === environment)?.title}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${fiscalActive ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300"}`}>
                    {fiscalActive ? "Facturación electrónica activa" : "Pendiente de activación"}
                  </span>
                </div>
                <div className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  {NCF_E_TIPO_OPCIONES.filter((type) => enabledTypes.includes(type.codigo)).map((type) => {
                    const seq = ecfSequences[type.codigo] || { start: 1, end: 1000, used: 0 };
                    const next = seq.start + seq.used;
                    return (
                      <div key={type.codigo} className="flex items-center justify-between gap-3 border-b border-border/70 pb-2 text-xs">
                        <span className="font-semibold text-foreground"><span className="mr-2 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">{type.codigo}</span>{type.descripcion.replace(`${type.codigo} - `, "")}</span>
                        <span className="font-mono font-bold text-green-600 dark:text-green-400">{String(next).padStart(10, "0")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {!fiscalActive && readiness && !readiness.ready && (
                <ul className="mt-5 space-y-1.5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-xs leading-relaxed text-yellow-700 dark:text-yellow-300">
                  {readiness.missing.map((issue) => <li key={issue.code} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> <span>{issue.message}</span></li>)}
                </ul>
              )}

              {fiscalActive ? (
                <button
                  type="button"
                  onClick={() => void deactivateElectronicBilling()}
                  disabled={saving}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 px-5 py-4 font-['Space_Grotesk',sans-serif] text-sm font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Desactivar facturación electrónica"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void activateElectronicBilling()}
                  disabled={saving || readinessLoading || !readiness?.ready}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 font-['Space_Grotesk',sans-serif] text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Rocket className="size-4" /> {saving ? "Activando..." : readinessLoading ? "Verificando..." : "Activar facturación electrónica"}
                </button>
              )}
            </div>
          )}

          {showActivationNotice && activationNotice(fiscalMode, environment) && (
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm text-primary">{activationNotice(fiscalMode, environment)}</div>
          )}
          {message && <div className="mt-5 rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm text-primary">{message}</div>}
          <div className="mt-7 flex items-center justify-between border-t border-border pt-5">
            <button type="button" onClick={() => setStep((current) => Math.max(WIZARD_STEP.company, current - 1))} disabled={step === WIZARD_STEP.company} className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40">
              <ChevronLeft className="size-4" /> Anterior
            </button>
            {step === WIZARD_STEP.company ? (
              <button type="button" onClick={() => void saveCompany()} disabled={saving} className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar y continuar"} <ChevronRight className="size-4" />
              </button>
            ) : step === WIZARD_STEP.environment ? (
              <button type="button" onClick={() => void saveEnvironment()} disabled={saving} className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar y continuar"} <ChevronRight className="size-4" />
              </button>
            ) : step === WIZARD_STEP.sequences ? (
              <button type="button" onClick={() => void saveSequences()} disabled={saving || enabledTypes.length === 0} className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar secuencias"} <ChevronRight className="size-4" />
              </button>
            ) : (
              <button type="button" onClick={() => setStep((current) => Math.min(steps.length, current + 1))} disabled={step === steps.length} className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50">
                Continuar <ChevronRight className="size-4" />
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function CompanyField({
  label,
  value,
  type = "text",
  onChange,
  readOnly = false,
}: {
  label: string;
  value: string;
  type?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={readOnly ? undefined : (event) => onChange?.(event.target.value)}
        className={`mt-1.5 w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none transition-colors ${
          readOnly
            ? "bg-muted/40 text-muted-foreground cursor-not-allowed border-dashed"
            : "bg-background text-foreground focus:border-primary"
        }`}
      />
    </label>
  );
}

function CertificationComplete() {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center py-12 text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30">
        <Award className="size-10" />
      </div>
      <h3 className="mt-6 font-['Space_Grotesk',sans-serif] text-3xl font-bold text-foreground">Checklist de certificación revisado</h3>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">La certificación sólo queda completada cuando la DGII lo confirma en su portal y el motor de emisión puede firmar y enviar e-CF.</p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-5 py-2.5 text-sm font-bold text-yellow-700 dark:text-yellow-300">
        <CircleAlert className="size-4" /> Confirmación DGII pendiente
      </div>
      <p className="mt-6 text-xs text-muted-foreground">No cambies a Producción ni emitas e-CF hasta contar con la aprobación en el portal y una prueba de envío aceptada.</p>
    </div>
  );
}

function ActivationStatus({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  const Icon = ready ? CircleCheck : CircleAlert;
  return (
    <div className={`rounded-2xl border p-4 ${ready ? "border-green-500/25 bg-green-500/5" : "border-yellow-500/25 bg-yellow-500/5"}`}>
      <div className="flex items-center gap-2"><Icon className={`size-4 ${ready ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-300"}`} /><span className="text-sm font-bold text-foreground">{label}</span></div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}
