import { type MouseEvent, useEffect, useState } from "react";
import { AlertTriangle, Award, Building2, Check, CheckCircle, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Copy, Download, ExternalLink, FileKey2, FileText, Hash, ListOrdered, RefreshCw, Rocket, Search, ShieldAlert, ShieldCheck, Sparkles, Upload, Wifi, X } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { insforgeClient } from "../../../shared/lib/insforge";
import { NCF_E_TIPO_OPCIONES } from "../../../shared/lib/ncf";
import { lookupBusinessByRnc } from "../../../shared/lib/dgiiRncLookup";

type EcfEnvironment = "test" | "certification" | "production";

const steps = [
  { label: "Datos de la empresa", icon: Building2 },
  { label: "Ambiente y certificado", icon: FileKey2 },
  { label: "Secuencias e-CF", icon: ListOrdered },
  { label: "Activación", icon: Rocket },
  { label: "Certificación DGII", icon: ShieldCheck },
] as const;

const environments: Array<{ id: EcfEnvironment; title: string; caption: string }> = [
  { id: "test", title: "Pruebas (TesteCF)", caption: "Set de pruebas de la DGII para empezar aquí." },
  { id: "certification", title: "Certificación (CerteCF)", caption: "Proceso de certificación con la DGII." },
  { id: "production", title: "Producción (e-CF)", caption: "Emisión real, requiere estar certificado." },
];

const certificationSteps = [
  "Registro en el Portal de Certificación",
  "Set de Pruebas ECF y RFCE",
  "Aprobación Comercial (ACEFC)",
  "Pruebas de Simulación e-CF",
  "Representación Impresa",
  "Validación por la DGII",
  "Registro de URLs de Prueba",
  "Recepción de e-CF (Prueba)",
  "Recepción de RFCE (Prueba)",
  "Recepción de ACECF (Prueba)",
  "Recepción de Notas (Prueba)",
  "Registro de URLs de Producción",
  "Declaración Jurada",
  "Verificación de Estatus",
  "Certificación Completada",
] as const;

const certificationPortalUrl = "https://ecf.dgii.gov.do/certecf/portalcertificacion/Login?ReturnUrl=%2Fcertecf%2Fportalcertificacion";

export function ActivationPanel() {
  const { tenantId } = useAuth();
  const [step, setStep] = useState(2);
  const [environment, setEnvironment] = useState<EcfEnvironment>("test");
  const [company, setCompany] = useState({ name: "", rnc: "", phone: "", email: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [ecfSequences, setEcfSequences] = useState<Record<string, { start: number; end: number; used: number }>>({
    E31: { start: 1, end: 1000, used: 0 },
    E32: { start: 1, end: 1000, used: 0 }
  });
  const [enabledTypes, setEnabledTypes] = useState<string[]>(["E31", "E32"]);
  const [certificateReady, setCertificateReady] = useState(false);
  const [certificateFileName, setCertificateFileName] = useState("");
  const [testSetFileName, setTestSetFileName] = useState("");
  const [commercialApprovalFileName, setCommercialApprovalFileName] = useState("");
  const [fiscalActive, setFiscalActive] = useState(false);
  const [certificationStep, setCertificationStep] = useState(1);
  const [companyLookupLoading, setCompanyLookupLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) return;

    void insforgeClient.database
      .from("tenants")
      .select("nombre_negocio, rnc, telefono, email, direccion, ecf_environment, ncf_secuencias_por_tipo, fiscal_mode")
      .eq("id", tenantId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        setCompany({
          name: data.nombre_negocio ?? "",
          rnc: data.rnc ?? "",
          phone: data.telefono ?? "",
          email: data.email ?? "",
          address: data.direccion ?? "",
        });
        setFiscalActive(data.fiscal_mode === "dgii_ecf");
        const savedSequences = (data.ncf_secuencias_por_tipo ?? {}) as Record<string, unknown>;
        const fiscalSequences = Object.fromEntries(
          NCF_E_TIPO_OPCIONES.flatMap((type) => {
            const sequence = Number(savedSequences[type.codigo]);
            return Number.isInteger(sequence) && sequence > 0 ? [[type.codigo, { start: sequence, end: sequence + 999, used: 0 }]] : [];
          })
        );
        if (Object.keys(fiscalSequences).length > 0) {
          setEcfSequences(fiscalSequences);
          setEnabledTypes(Object.keys(fiscalSequences));
        }
        if (["test", "certification", "production"].includes(data.ecf_environment)) {
          setEnvironment(data.ecf_environment as EcfEnvironment);
        }
      });
  }, [tenantId]);

  async function saveEnvironment() {
    setSaving(true);
    setMessage("");
    setStep(3);
    setMessage("Ambiente seleccionado para el diseño. Se persistirá cuando conectemos el motor e-CF.");
    setSaving(false);
  }

  async function saveSequences() {
    if (enabledTypes.length === 0) return;
    setSaving(true);
    setMessage("");

    setStep(4);
    setMessage("Secuencias preparadas en el diseño. Se conectarán a las asignaciones autorizadas al implementar el motor.");
    setSaving(false);
  }

  function toggleType(type: string) {
    setEnabledTypes((current) => {
      if (current.includes(type)) return current.filter((item) => item !== type);
      return [...current, type];
    });
    setEcfSequences((current) => ({ ...current, [type]: current[type] || { start: 1, end: 1000, used: 0 } }));
  }

  function activateElectronicBilling() {
    const missing = [
      !company.name && "datos de la empresa",
      !company.rnc && "RNC del emisor",
      !certificateReady && "certificado digital",
      enabledTypes.length === 0 && "secuencias e-CF",
    ].filter(Boolean);

    if (missing.length > 0) {
      setMessage(`Completá ${missing.join(", ")} antes de activar la facturación electrónica.`);
      return;
    }

    setStep(5);
    setMessage("Diseño de activación validado. La activación real quedará disponible con el motor e-CF.");
  }

  async function handleCompanyLookup() {
    setCompanyLookupLoading(true);
    setMessage("");
    try {
      const result = await lookupBusinessByRnc(company.rnc);
      if (result.error || !result.data) {
        setMessage(result.error || "No encontramos la empresa en la DGII.");
        return;
      }
      setCompany((current) => ({
        ...current,
        rnc: result.data.rnc,
        name: result.data.tradeName || result.data.legalName,
      }));
      setMessage(`Empresa encontrada: ${result.data.legalName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo consultar la empresa en la DGII.");
    } finally {
      setCompanyLookupLoading(false);
    }
  }

  function verifyConfiguration() {
    const ready = Boolean(company.name && company.rnc && certificateReady && enabledTypes.length > 0);
    setMessage(ready
      ? "La configuración está completa y lista para activar la facturación electrónica."
      : "Falta completar empresa, certificado digital o secuencias e-CF.");
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
      <div className="mx-auto max-w-[1180px]">
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
            const completed = index + 1 < step;
            const current = index + 1 === step;
            return (
              <div key={item.label} className="flex min-w-fit items-center">
                <button
                  type="button"
                  onClick={() => setStep(index + 1)}
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
          {step === 1 && (
            <div className="max-w-xl">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Paso 1</span>
              <h2 className="mt-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-foreground">Datos de la empresa</h2>
              <p className="mt-2 text-sm text-muted-foreground">Estos datos identifican al emisor ante la DGII.</p>
              <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/5 p-4">
                <label className="text-[10px] font-bold uppercase tracking-wider text-primary">Consultar por RNC o cédula</label>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={company.rnc}
                    onChange={(event) => setCompany((current) => ({ ...current, rnc: event.target.value }))}
                    placeholder="Ej. 131123456"
                    className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary"
                  />
                  <button type="button" onClick={() => void handleCompanyLookup()} disabled={companyLookupLoading || !company.rnc.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50">
                    <Search className="size-4" /> {companyLookupLoading ? "Consultando..." : "Consultar DGII"}
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <CompanyField label="Razón social o nombre comercial" value={company.name} onChange={(name) => setCompany((current) => ({ ...current, name }))} />
                <CompanyField label="Teléfono" value={company.phone} onChange={(phone) => setCompany((current) => ({ ...current, phone }))} />
                <CompanyField label="Correo electrónico" value={company.email} type="email" onChange={(email) => setCompany((current) => ({ ...current, email }))} />
                <CompanyField label="Dirección fiscal" value={company.address} onChange={(address) => setCompany((current) => ({ ...current, address }))} />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Los cambios de esta pantalla son de diseño y todavía no modifican la ficha del negocio.</p>
            </div>
          )}

          {step === 2 && (
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Paso 2</span>
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

              <label className="mt-5 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-primary/35 bg-primary/5 px-6 py-8 text-center transition-colors hover:bg-primary/10">
                <FileKey2 className="size-8 text-primary" />
                <span className="mt-3 font-['Space_Grotesk',sans-serif] text-sm font-bold text-foreground">Previsualizar certificado digital</span>
                <span className="mt-1 text-xs text-muted-foreground">.p12 o .pfx. No se carga ni se guarda durante esta etapa de diseño.</span>
                <input
                  type="file"
                  accept=".p12,.pfx,application/x-pkcs12"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    setCertificateFileName(file?.name ?? "");
                    setCertificateReady(Boolean(file));
                  }}
                />
              </label>
              {certificateFileName && <p className="mt-3 rounded-xl border border-green-500/25 bg-green-500/5 px-4 py-3 text-xs text-green-700 dark:text-green-300">Archivo seleccionado: <span className="font-semibold">{certificateFileName}</span>. La validación criptográfica se habilitará con el motor e-CF.</p>}
            </div>
          )}

          {step === 3 && (
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Paso 3</span>
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
          {step === 4 && (
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Paso 4</span>
              <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <h2 className="font-['Space_Grotesk',sans-serif] text-2xl font-bold text-foreground">Activación</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Revisá el estado de tu configuración antes de habilitar la emisión electrónica.</p>
                </div>
                <button type="button" onClick={verifyConfiguration} className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-foreground transition-colors hover:bg-muted">
                  Verificar configuración
                </button>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <ActivationStatus label="Empresa" detail={company.name && company.rnc ? `${company.name} · ${company.rnc}` : "Completá los datos del emisor"} ready={Boolean(company.name && company.rnc)} />
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

              <button
                type="button"
                onClick={activateElectronicBilling}
                disabled={saving || fiscalActive}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 font-['Space_Grotesk',sans-serif] text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Rocket className="size-4" /> {fiscalActive ? "Facturación electrónica activa" : "Preparar activación"}
              </button>
            </div>
          )}
          {step === 5 && (
            <div>
              {certificationStep !== 15 && (
                <>
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Paso 5</span>
                  <h2 className="mt-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-foreground">Certificación DGII</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Completá los hitos requeridos antes de solicitar la habilitación para producción.</p>
                </>
              )}

              <div className="mt-6 rounded-2xl border border-border bg-background p-4 sm:p-6">
                <ol className="relative grid grid-cols-[repeat(15,minmax(0,1fr))] items-center">
                  <div className="absolute left-[3.33%] right-[3.33%] top-1/2 h-px -translate-y-1/2 bg-border" aria-hidden="true" />
                  {certificationSteps.map((item, index) => {
                    const number = index + 1;
                    const current = number === certificationStep;
                    const complete = number < certificationStep;
                    return (
                      <li key={item} className="relative z-10 flex justify-center">
                        <button type="button" onClick={() => setCertificationStep(number)} title={item} aria-label={`Paso ${number}: ${item}`} className={`flex size-7 items-center justify-center rounded-full border text-[10px] font-bold transition-transform hover:scale-110 sm:size-8 ${complete ? "border-primary bg-primary text-primary-foreground" : current ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "border-border bg-muted text-muted-foreground"}`}>
                          {complete ? <Check className="size-3" /> : number}
                        </button>
                      </li>
                    );
                  })}
                </ol>

                {certificationStep === 15 ? (
                  <CertificationComplete />
                ) : (
                  <>
                <div className="mt-6 rounded-xl border border-primary/15 bg-primary/5 px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-primary">
                    {certificationStep === 7 || certificationStep === 12 ? <Wifi className="size-4" /> : <ShieldCheck className="size-4" />} Paso {certificationStep} - {certificationSteps[certificationStep - 1]}
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
                  ) : certificationStep === 7 ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      Estas son tus URLs únicas en el portal DGII. Cópialas en los campos correspondientes del <button type="button" onClick={openCertificationPortal} className="font-semibold text-primary hover:underline">Portal CerteCF</button>.
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
                      {certificationStep === 1 ? (
                        <>
                          <li>Ingresá al <a href={certificationPortalUrl} onClick={openCertificationPortal} target="_blank" rel="noreferrer" className="font-semibold text-primary underline underline-offset-2">Portal de Certificación de la DGII</a>.</li>
                          <li>Registrá tu empresa con el RNC <span className="font-semibold text-foreground">{company.rnc || "del emisor"}</span>.</li>
                          <li>Seleccioná el tipo de postulación: Emisor de e-CF.</li>
                          <li>Completá el formulario y esperá la aprobación por correo.</li>
                        </>
                      ) : certificationStep === 2 ? (
                        <li>Descargá el Set de Pruebas ECF y RFCE desde el portal y preparalo para cargarlo.</li>
                      ) : certificationStep === 3 ? (
                        <li>Descargá el archivo de Aprobación Comercial desde el portal de certificación y preparalo para cargarlo.</li>
                      ) : (
                        <li>Completá y documentá el hito con la DGII antes de avanzar al siguiente paso.</li>
                      )}
                    </ol>
                  )}
                </div>

                {certificationStep === 2 && (
                  <div className="mt-4 rounded-xl border border-dashed border-primary/35 bg-muted/20 p-5">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground"><FileKey2 className="size-4 text-primary" /> Subir Set de Pruebas de la DGII (.xlsx)</div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm">
                        <Upload className="size-4" /> Seleccionar archivo
                        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => setTestSetFileName(event.target.files?.[0]?.name ?? "")} />
                      </label>
                      <span className="text-xs text-muted-foreground">{testSetFileName || "Ningún archivo seleccionado"}</span>
                      <button type="button" disabled={!testSetFileName} onClick={() => setMessage("Set de pruebas seleccionado para el diseño. La carga y procesamiento se habilitarán con el motor e-CF.")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 px-4 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto">
                        <Upload className="size-4" /> Cargar Set
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">Seleccioná el Excel descargado desde el portal DGII. El procesamiento todavía no está conectado.</p>
                  </div>
                )}

                {certificationStep === 3 && (
                  <div className="mt-4 rounded-xl border border-dashed border-primary/35 bg-muted/20 p-5">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground"><FileKey2 className="size-4 text-primary" /> Subir archivo ACEFC de la DGII (.xlsx)</div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Incluye los e-CF que la empresa recibe y aprueba, con RNC emisor, RNC comprador y fecha/hora de aprobación comercial.</p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm">
                        <Upload className="size-4" /> Seleccionar archivo
                        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => setCommercialApprovalFileName(event.target.files?.[0]?.name ?? "")} />
                      </label>
                      <span className="text-xs text-muted-foreground">{commercialApprovalFileName || "Ningún archivo seleccionado"}</span>
                      <button type="button" disabled={!commercialApprovalFileName} onClick={() => setMessage("Archivo ACEFC seleccionado para el diseño. La validación y envío a DGII se habilitarán con el motor e-CF.")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 px-4 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto">
                        <Upload className="size-4" /> Cargar ACEFC
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">Descargá el archivo de Aprobación Comercial desde el portal de certificación de la DGII.</p>
                  </div>
                )}

                {certificationStep === 4 && (
                  <>
                    <div className="mt-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h4 className="flex items-center gap-2 text-sm font-bold text-foreground"><Hash className="size-4 text-muted-foreground" /> Secuencias NCF autorizadas</h4>
                        <button type="button" className="text-xs font-semibold text-primary hover:underline">Actualizar</button>
                      </div>
                      <div className="mt-4 flex flex-col gap-3">
                        {NCF_E_TIPO_OPCIONES.filter((type) => enabledTypes.includes(type.codigo)).map((type) => {
                          const seq = ecfSequences[type.codigo] || { start: 1, end: 1000, used: 0 };
                          const nextSequenceNumber = seq.start + seq.used;
                          const startSeq = String(nextSequenceNumber).padStart(10, "0");
                          const endSeq = String(seq.end).padStart(10, "0");
                          const remaining = Math.max(0, seq.end - nextSequenceNumber + 1);
                          return (
                            <div key={type.codigo} className="flex flex-col gap-2 border-b border-border/50 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-3">
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-primary">{type.codigo}</span>
                                <span className="font-mono text-xs text-muted-foreground">{type.codigo}{String(seq.start).padStart(10, "0")} - {type.codigo}{endSeq}</span>
                              </div>
                              <div className="flex items-center gap-4 text-[11px]">
                                <span className="text-muted-foreground">Usados: <strong className="text-foreground">{seq.used}</strong></span>
                                <span className="font-semibold text-green-600 dark:text-green-400">Restantes: {remaining.toLocaleString()}</span>
                                <span className="text-muted-foreground">Próximo: <strong className="font-mono text-foreground">{type.codigo}{startSeq}</strong></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-3 text-[10px] text-muted-foreground">Las secuencias avanzan y no se reutilizan: si un comprobante es rechazado, el siguiente intento usa la próxima secuencia disponible.</p>
                    </div>

                    <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-5">
                      <h4 className="flex items-center gap-2 text-sm font-bold text-sky-700 dark:text-sky-400"><Sparkles className="size-4" /> Generar comprobantes desde el sistema</h4>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">El sistema crea automáticamente los e-CF exigidos (E31, E32, E33, E41, E43-E47) con los datos de tu empresa, asignando eNCF de tus secuencias autorizadas (sin repetir) y firmados con tu certificado. Luego se envían a la DGII.</p>
                      <button type="button" onClick={() => setMessage("Generación simulada iniciada en modo diseño. Requiere el motor e-CF para procesar y enviar a DGII.")} className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-sky-700">
                        Iniciar generación de prueba
                      </button>
                    </div>
                  </>
                )}

                {certificationStep === 5 && (
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-xs leading-relaxed text-yellow-700 dark:text-yellow-400">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <p>
                        La suma de todos los archivos no puede superar <strong className="font-semibold">10MB</strong> (cada PDF pesa ~30KB, sin problema). Es responsabilidad del contribuyente que la representación cumpla la Ley 32-23 y el Formato e-CF.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/20 py-8 text-center">
                      <p className="text-xs font-semibold text-muted-foreground">No hay comprobantes de simulación. Genera y envía los del Paso 4 primero.</p>
                    </div>
                  </div>
                )}

                {certificationStep === 6 && (
                  <button type="button" onClick={openCertificationPortal} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700">
                    <ExternalLink className="size-4" /> Verificar en Portal DGII
                  </button>
                )}

                {certificationStep === 7 && (
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="rounded-xl border border-border bg-muted/10 p-5">
                      <UrlCopyField label="SERVICIO DE AUTENTICACIÓN" url={`https://api.cloudix.com/rnc_${company.rnc || "EMISOR"}/fe/autenticacion/api/[semilla|ValidacionCertificado]`} onCopy={(url) => { void navigator.clipboard.writeText(url); setMessage("URL de Autenticación copiada al portapapeles."); }} />
                      <UrlCopyField label="SERVICIO DE RECEPCIÓN *" url={`https://api.cloudix.com/rnc_${company.rnc || "EMISOR"}/fe/recepcion/api/ecf`} onCopy={(url) => { void navigator.clipboard.writeText(url); setMessage("URL de Recepción copiada al portapapeles."); }} />
                      <UrlCopyField label="SERVICIO DE APROBACIÓN COMERCIAL *" url={`https://api.cloudix.com/rnc_${company.rnc || "EMISOR"}/fe/aprobacioncomercial/api/ecf`} onCopy={(url) => { void navigator.clipboard.writeText(url); setMessage("URL de Aprobación Comercial copiada al portapapeles."); }} />
                    </div>

                    <button type="button" onClick={() => setMessage("Configuración de URLs guardada para el diseño.")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1e293b] px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-900">
                      <Wifi className="size-4" /> Guardar configuración de URLs
                    </button>
                    <button type="button" onClick={openCertificationPortal} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-700">
                      <ExternalLink className="size-4" /> Ir al Portal DGII a registrar las URLs
                    </button>
                  </div>
                )}

                {certificationStep === 8 && (
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-yellow-700 dark:text-yellow-400">
                      <div className="flex items-center gap-2 font-bold">
                        <ShieldAlert className="size-4" /> Certificado Raíz CA — No encontrado
                      </div>
                      <p className="mt-2 text-xs leading-relaxed">
                        El sistema necesita el certificado CA de digifirma para validar las firmas de DGII. Descárgalo desde el portal DGII e instálalo contactando al administrador.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
                          <Download className="size-4 text-muted-foreground" /> e-CF Recibidos de DGII
                        </h4>
                        <button type="button" onClick={() => setMessage("Simulación de actualización. Aún no hay eventos de recepción del motor e-CF.")} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-muted">
                          <RefreshCw className="size-3" /> Actualizar
                        </button>
                      </div>
                      <div className="py-6 text-center">
                        <p className="text-xs font-semibold text-muted-foreground">Ninguno aún. Presiona "Inicio envío de pruebas" en el portal DGII para que envíen los comprobantes.</p>
                      </div>
                    </div>

                    <button type="button" onClick={openCertificationPortal} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700">
                      <ExternalLink className="size-4" /> Ir al Portal DGII — Iniciar envío de pruebas
                    </button>
                  </div>
                )}

                {certificationStep === 9 && (
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
                          <Download className="size-4 text-muted-foreground" /> RFCE (E32) Recibidas
                        </h4>
                        <button type="button" onClick={() => setMessage("Simulación de actualización. Aún no hay eventos de recepción del motor e-CF.")} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-muted">
                          <RefreshCw className="size-3" /> Actualizar
                        </button>
                      </div>
                      <div className="py-6 text-center">
                        <p className="text-xs font-semibold text-muted-foreground">Ninguna aún. Regresa al portal DGII y presiona "Inicio envío de pruebas" para RFCE.</p>
                      </div>
                    </div>

                    <button type="button" onClick={openCertificationPortal} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700">
                      <ExternalLink className="size-4" /> Ir al Portal DGII — Iniciar envío RFCE
                    </button>
                  </div>
                )}

                {(certificationStep === 10 || certificationStep === 11) && (
                  <div className="mt-4 flex flex-col gap-4">
                    <button type="button" onClick={openCertificationPortal} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700">
                      <ExternalLink className="size-4" /> Ir al Portal DGII
                    </button>
                  </div>
                )}

                {certificationStep === 12 && (
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="rounded-xl border border-border bg-muted/10 p-5">
                      <UrlCopyField label="SERVICIO DE AUTENTICACIÓN" url={`https://api.cloudix.com/rnc_${company.rnc || "EMISOR"}/fe/autenticacion/api/[semilla|ValidacionCertificado]`} onCopy={(url) => { void navigator.clipboard.writeText(url); setMessage("URL de Autenticación copiada al portapapeles."); }} />
                      <UrlCopyField label="SERVICIO DE RECEPCIÓN *" url={`https://api.cloudix.com/rnc_${company.rnc || "EMISOR"}/fe/recepcion/api/ecf`} onCopy={(url) => { void navigator.clipboard.writeText(url); setMessage("URL de Recepción copiada al portapapeles."); }} />
                      <UrlCopyField label="SERVICIO DE APROBACIÓN COMERCIAL *" url={`https://api.cloudix.com/rnc_${company.rnc || "EMISOR"}/fe/aprobacioncomercial/api/ecf`} onCopy={(url) => { void navigator.clipboard.writeText(url); setMessage("URL de Aprobación Comercial copiada al portapapeles."); }} />
                    </div>

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
                        Para firmar este XML necesitas tener cargado y validado el certificado digital en el Paso 2.
                      </p>
                    </div>

                    <div className="rounded-xl border border-dashed border-primary/35 bg-muted/20 p-5">
                      <div className="flex items-center gap-2 text-sm font-bold text-foreground"><Download className="size-4 text-primary" /> Firmar declaracion jurada XML</div>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm">
                          <Upload className="size-4" /> Seleccionar archivo
                          <input type="file" accept=".xml,application/xml" className="sr-only" onChange={(event) => setMessage(`Archivo ${event.target.files?.[0]?.name ?? ""} seleccionado para simulación de firma.`)} />
                        </label>
                        <span className="text-xs text-muted-foreground">Ningún archivo seleccionado</span>
                        <button type="button" disabled className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 px-4 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto">
                          <CheckCircle className="size-4" /> Firmar XML
                        </button>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">Este paso no envia el archivo automaticamente: solo lo firma para que el usuario lo suba manualmente en el portal DGII.</p>
                    </div>

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

                <button type="button" onClick={() => setCertificationStep((current) => Math.min(certificationSteps.length, current + 1))} disabled={certificationStep === certificationSteps.length || certificationStep === 8} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold transition-colors ${certificationStep === 8 ? "cursor-not-allowed bg-sky-500/50 text-white shadow-none" : "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"}`}>
                  {certificationStep === certificationSteps.length ? "Certificación lista para revisión" : certificationStep === 14 ? "> Marcar como aprobado manualmente" : certificationStep === 13 ? "> XML enviado a DGII — Avanzar" : certificationStep === 12 ? "> URLs registradas — Avanzar al Paso 13" : certificationStep === 11 ? "Completado — Avanzar al Paso 12" : certificationStep === 10 ? "Completado — Avanzar al Paso 11" : certificationStep === 9 ? "Completado — Avanzar al Paso 10" : certificationStep === 8 ? "> Esperando e-CFs de DGII..." : certificationStep === 7 ? "URLs registradas — Avanzar al Paso 8" : certificationStep === 6 ? "DGII aprobó — Avanzar al Paso 7" : certificationStep === 5 ? "Representaciones subidas — Avanzar" : `Ya completé este paso - Avanzar al paso ${certificationStep + 1}`} {certificationStep !== 8 && certificationStep !== 14 && certificationStep !== 13 && certificationStep !== 12 && certificationStep !== 15 && <ChevronRight className="size-4" />}
                </button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="mt-7 flex items-center justify-between border-t border-border pt-5">
            <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1} className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40">
              <ChevronLeft className="size-4" /> Anterior
            </button>
            {step === 2 ? (
              <button type="button" onClick={() => void saveEnvironment()} disabled={saving} className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar y continuar"} <ChevronRight className="size-4" />
              </button>
            ) : step === 3 ? (
              <button type="button" onClick={() => void saveSequences()} disabled={saving || enabledTypes.length === 0} className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar secuencias"} <ChevronRight className="size-4" />
              </button>
            ) : (
              <button type="button" onClick={() => setStep((current) => Math.min(steps.length, current + 1))} disabled={step === steps.length} className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50">
                Continuar <ChevronRight className="size-4" />
              </button>
            )}
          </div>
          {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
        </section>
      </div>
    </div>
  );
}

function CompanyField({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
    </label>
  );
}

function CertificationComplete() {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center py-12 text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30">
        <Award className="size-10" />
      </div>
      <h3 className="mt-6 font-['Space_Grotesk',sans-serif] text-3xl font-bold text-foreground">Certificación completada</h3>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">Tu empresa está oficialmente certificada por la DGII para emitir e-CF en producción.</p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-5 py-2.5 text-sm font-bold text-green-700 dark:text-green-400">
        <CheckCircle className="size-4" /> Certificado DGII
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Cambiá al ambiente de Producción en el Paso 2 y comenzá a facturar en vivo.</p>
    </div>
  );
}

function UrlCopyField({ label, url, onCopy }: { label: string; url: string; onCopy: (url: string) => void }) {
  return (
    <div className="mb-4 last:mb-0">
      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="mt-1.5 flex gap-2">
        <input type="text" readOnly value={url} className="flex-1 rounded-xl border border-green-500/30 bg-green-500/5 px-3 py-2.5 font-mono text-[11px] text-green-700 outline-none dark:text-green-400" />
        <button type="button" onClick={() => onCopy(url)} title="Copiar URL" className="flex shrink-0 items-center justify-center rounded-xl border border-border bg-background px-3 transition-colors hover:bg-muted">
          <Copy className="size-4 text-muted-foreground" />
        </button>
      </div>
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
