import { useState, useEffect, useRef, useMemo } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import type { ThermalPrinterInfo } from "../../../shared/types/electron";
import type { PaperWidthMm } from "../../../shared/lib/thermalStorage";
import {
  getThermalPrintSettings,
  saveThermalPrintSettings,
} from "../../../shared/lib/thermalStorage";
import {
  buildFacturaReceiptHtml,
  buildComandaReceiptHtml,
  buildSplitTicketHtml,
  buildThermalSplitLineHtml,
  buildCierreDiaReceiptHtml,
  type TenantReceiptInfo,
  type CierreDiaThermalData,
} from "../../../shared/lib/receiptTemplates";
import {
  saveTenantLogoUrl,
  uploadTenantLogoFile,
} from "../../../shared/lib/tenantLogoStorage";
import { useAppUpdate } from "../../updates/AppUpdateContext";
import {
  buildBSequenceMapFromRow,
  buildNcfSequenceMapForSave,
  buildTenantNcfUpdatePayload,
  DEFAULT_NCF_B_CODE,
  NCF_B_SEQUENCE_FIELDS_SELECT,
  construirCadenaNcf,
  etiquetaTipoNcf,
  isNcfBCode,
  NCF_B_TIPO_OPCIONES,
  type NcfBCode,
  type TenantNcfRow,
} from "../../../shared/lib/ncf";

interface Config {
  nombre_empresa: string;
  rnc: string;
  logo_url: string;
  direccion: string;
  telefono: string;
  currency_code: "DOP" | "ARS";
  itbis_cobro_por_defecto: boolean;
  ncf_fiscal_activo: boolean;
  ncf_tipo_default: NcfBCode;
  ncf_secuencia_siguiente: number;
  ncf_secuencias_por_tipo: Record<NcfBCode, number>;
}

const CURRENCY_OPTIONS: Array<{ code: Config["currency_code"]; label: string }> = [
  { code: "DOP", label: "Peso dominicano (RD$)" },
  { code: "ARS", label: "Peso argentino (AR$)" },
];

/** Factura de ejemplo: solo para vista previa en Ajustes (mismos campos que un cobro real). */
const SAMPLE_FACTURA_THERMAL: Parameters<typeof buildFacturaReceiptHtml>[1] = {
  items: [
    { nombre: "Plato del menú (ejemplo)", cantidad: 2, precio_unitario: 275.5, subtotal: 551 },
    { nombre: "Bebida (ejemplo)", cantidad: 1, precio_unitario: 85, subtotal: 85 },
  ],
  subtotal: 636,
  itbis: 114.48,
  total: 750.48,
  metodo_pago: "efectivo",
  mesa_numero: 4,
  notas: "Vista previa — ítems y totales son de ejemplo.",
  estado: "pagada",
};

const SAMPLE_COMANDA_THERMAL: Parameters<typeof buildComandaReceiptHtml>[1] = {
  id: "preview-comanda",
  numero_comanda: 42,
  mesa_numero: 4,
  items: [
    { nombre: "Plato del menú (ejemplo)", cantidad: 2, categoria: "General" },
    { nombre: "Bebida (ejemplo)", cantidad: 1, categoria: "Bebidas" },
  ],
  notas: "Vista previa — nota de cocina de ejemplo.",
};

const SAMPLE_FACTURA_THERMAL_PREVIEW: Parameters<typeof buildFacturaReceiptHtml>[1] = {
  ...SAMPLE_FACTURA_THERMAL,
  items: [
    {
      nombre: "Plato del menú (ejemplo)",
      categoria: "General",
      cantidad: 2,
      precio_unitario: 275.5,
      subtotal: 551,
    },
    {
      nombre: "Bebida (ejemplo)",
      categoria: "Bebidas",
      cantidad: 1,
      precio_unitario: 85,
      subtotal: 85,
    },
  ],
};

const SAMPLE_CIERRE_THERMAL_BASE: Omit<CierreDiaThermalData, "generadoEn" | "generadoAtIso"> = {
  fechaOperacion: "12/04/2026",
  facturasPagadas: 14,
  facturasPendientes: 2,
  facturasCanceladas: 0,
  totalPagado: 12450.75,
  subtotalPagado: 10551.48,
  itbisPagado: 1899.27,
  porMetodo: [
    { etiqueta: "Efectivo", cantidad: 8, total: 6200 },
    { etiqueta: "Tarjeta", cantidad: 5, total: 5250.75 },
    { etiqueta: "Digital", cantidad: 1, total: 1000 },
  ],
  ticketPromedioPagado: 889.34,
  cuentasAbiertasLineas: 5,
  cuentasAbiertasMesas: 2,
  cuentasAbiertasSubtotal: 450,
  cuentasAbiertasItbisEst: 81,
  cuentasAbiertasTotalEst: 531,
};

type ThermalPreviewKind = "factura" | "comanda" | "cierre" | "split";

const THERMAL_PREVIEW_TABS: { id: ThermalPreviewKind; label: string }[] = [
  { id: "factura", label: "Factura" },
  { id: "comanda", label: "Comanda" },
  { id: "cierre", label: "Cierre" },
  { id: "split", label: "Separar cuenta" },
];

export function Ajustes() {
  const { tenantId, loading: authLoading } = useAuth();
  const [config, setConfig] = useState<Config>({
    nombre_empresa: "",
    rnc: "",
    logo_url: "",
    direccion: "",
    telefono: "",
    currency_code: "DOP",
    itbis_cobro_por_defecto: false,
    ncf_fiscal_activo: false,
    ncf_tipo_default: DEFAULT_NCF_B_CODE,
    ncf_secuencia_siguiente: 1,
    ncf_secuencias_por_tipo: buildBSequenceMapFromRow(null),
  });
  const [thermalPreviewNonce, setThermalPreviewNonce] = useState(0);
  const [thermalPreviewKind, setThermalPreviewKind] =
    useState<ThermalPreviewKind>("factura");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [partialSaveNote, setPartialSaveNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const TENANT_FIELDS_BASE =
    "nombre_negocio, rnc, logo_url, direccion, telefono";
  const TENANT_FIELDS_CURRENCY = "moneda";
  const TENANT_FIELDS_NCF =
    `itbis_cobro_por_defecto, ncf_fiscal_activo, ncf_tipo_default, ncf_secuencia_siguiente, ncf_secuencias_por_tipo, ${NCF_B_SEQUENCE_FIELDS_SELECT}`;

  useEffect(() => {
    if (authLoading) return;

    if (!tenantId) {
      setLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setLoadError("");

    void (async () => {
      let res = await insforgeClient.database
        .from("tenants")
        .select(`${TENANT_FIELDS_BASE}, ${TENANT_FIELDS_CURRENCY}, ${TENANT_FIELDS_NCF}`)
        .eq("id", tenantId)
        .maybeSingle();

      if (res.error && !cancelled) {
        // Fallback: esquema alterno si la divisa está en currency_code.
        res = await insforgeClient.database
          .from("tenants")
          .select(`${TENANT_FIELDS_BASE}, currency_code, ${TENANT_FIELDS_NCF}`)
          .eq("id", tenantId)
          .maybeSingle();
      }

      if (res.error && !cancelled) {
        // Fallback final: solo campos base (cuando también faltan columnas NCF).
        res = await insforgeClient.database
          .from("tenants")
          .select(TENANT_FIELDS_BASE)
          .eq("id", tenantId)
          .maybeSingle();
      }

      if (cancelled) return;

      if (res.error) {
        setLoadError(
          res.error.message ||
            "No se pudo cargar el negocio. Si acabás de desplegar cambios, ejecutá el SQL de columnas NCF o revisá la consola."
        );
        setLoading(false);
        return;
      }

      const data = res.data as
        | (TenantNcfRow & {
            nombre_negocio?: string | null;
            rnc?: string | null;
            logo_url?: string | null;
            direccion?: string | null;
            telefono?: string | null;
            moneda?: string | null;
            currency_code?: string | null;
            itbis_cobro_por_defecto?: boolean | null;
          })
        | null;
      if (data) {
        const tenantNcfData = data as TenantNcfRow & {
          ncf_tipo_default?: string | null;
          ncf_fiscal_activo?: boolean | null;
          itbis_cobro_por_defecto?: boolean | null;
        };
        const defaultTypeRaw = tenantNcfData.ncf_tipo_default;
        const defaultType = isNcfBCode(defaultTypeRaw) ? defaultTypeRaw : DEFAULT_NCF_B_CODE;
        const ncfSequences = buildBSequenceMapFromRow(tenantNcfData);
        const currencyRaw = (
          (data as { moneda?: string | null }).moneda ||
          (data as { currency_code?: string | null }).currency_code ||
          "DOP"
        )
          .trim()
          .toUpperCase();
        setConfig({
          nombre_empresa: data.nombre_negocio ?? "",
          rnc: data.rnc ?? "",
          logo_url: data.logo_url ?? "",
          direccion: data.direccion ?? "",
          telefono: data.telefono ?? "",
          currency_code: currencyRaw === "ARS" ? "ARS" : "DOP",
          itbis_cobro_por_defecto: Boolean(tenantNcfData.itbis_cobro_por_defecto),
          ncf_fiscal_activo: Boolean(tenantNcfData.ncf_fiscal_activo),
          ncf_tipo_default: defaultType,
          ncf_secuencia_siguiente: ncfSequences[defaultType] ?? 1,
          ncf_secuencias_por_tipo: ncfSequences,
        });
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, tenantId]);

  async function handleSave() {
    return handleSaveNcfByType();

    if (!tenantId) {
      setSaveError("No hay negocio vinculado a tu cuenta.");
      return;
    }

    setSaving(true);
    setSavedOk(false);
    setSaveError("");
    setPartialSaveNote("");
    setLogoUploadError("");

    const nextBSequences = Object.fromEntries(
      NCF_B_TIPO_OPCIONES.map((opcion) => {
        const seq = Math.floor(Number(config.ncf_secuencias_por_tipo[opcion.codigo]));
        return [opcion.codigo, Number.isFinite(seq) && seq >= 1 ? seq : 1];
      })
    ) as Record<NcfBCode, number>;
    const nextDefaultSequence = nextBSequences[config.ncf_tipo_default] ?? 1;
    if (config.ncf_fiscal_activo) {
      if (!config.ncf_tipo_default.trim()) {
        setSaveError("Elegí un tipo de comprobante fiscal (NCF).");
        setSaving(false);
        return;
      }
      for (const _opcion of NCF_B_TIPO_OPCIONES) {
        setSaveError("La secuencia NCF debe ser un número entre 1 y 99.999.999.");
        setSaving(false);
        return;
      }
    }

    const baseUpdate = {
      nombre_negocio: config.nombre_empresa.trim() || "Mi negocio",
      rnc: config.rnc.trim() || null,
      logo_url: config.logo_url.trim() || null,
      direccion: config.direccion.trim() || null,
      telefono: config.telefono.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const currencyUpdateMoneda = {
      moneda: config.currency_code,
    };
    const currencyUpdateCode = {
      currency_code: config.currency_code,
    };
    const ncfUpdate = {
      ncf_fiscal_activo: config.ncf_fiscal_activo,
      ncf_tipo_default: config.ncf_tipo_default,
      ncf_secuencia_siguiente: nextDefaultSequence,
      ncf_secuencias_por_tipo: buildNcfSequenceMapForSave(nextBSequences),
    };

    let { error } = await insforgeClient.database
      .from("tenants")
      .update({ ...baseUpdate, ...currencyUpdateMoneda, ...ncfUpdate })
      .eq("id", tenantId);

    if (error?.message) {
      // Fallback 1: esquema alterno si la divisa vive en currency_code.
      const retryWithoutCurrency = await insforgeClient.database
        .from("tenants")
        .update({ ...baseUpdate, ...currencyUpdateCode, ...ncfUpdate })
        .eq("id", tenantId);
      error = retryWithoutCurrency.error;

      if (!retryWithoutCurrency.error) {
        setSaving(false);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 5000);
        return;
      }

      // Fallback 2: guardar sin divisa (si faltan columnas de moneda).
      const retryWithoutAnyCurrency = await insforgeClient.database
        .from("tenants")
        .update({ ...baseUpdate, ...ncfUpdate })
        .eq("id", tenantId);
      error = retryWithoutAnyCurrency.error;
      if (!retryWithoutAnyCurrency.error) {
        setPartialSaveNote(
          "Datos guardados, pero no se pudo persistir la divisa. Revisá columnas `tenants.moneda` o `tenants.currency_code`."
        );
        setSaving(false);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 5000);
        return;
      }

      // Fallback 3: guardar solo base (si faltan también columnas NCF).
      const retryBaseOnly = await insforgeClient.database
        .from("tenants")
        .update(baseUpdate)
        .eq("id", tenantId);
      error = retryBaseOnly.error;
      if (!retryBaseOnly.error) {
        setPartialSaveNote(
          "Datos básicos guardados. Faltan columnas para guardar NCF/divisa (`tenants.currency_code` y/o columnas NCF)."
        );
        setSaving(false);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 5000);
        return;
      }
    }

    if (error?.message) {
      setSaveError(error?.message || "Error al guardar. Intentá de nuevo.");
    } else {
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    }
    setSaving(false);
  }

  async function handleSaveNcfByType() {
    if (!tenantId) {
      setSaveError("No hay negocio vinculado a tu cuenta.");
      return;
    }

    setSaving(true);
    setSavedOk(false);
    setSaveError("");
    setPartialSaveNote("");
    setLogoUploadError("");

    const nextBSequences = Object.fromEntries(
      NCF_B_TIPO_OPCIONES.map((opcion) => {
        const seq = Math.floor(Number(config.ncf_secuencias_por_tipo[opcion.codigo]));
        return [opcion.codigo, Number.isFinite(seq) && seq >= 1 ? seq : 1];
      })
    ) as Record<NcfBCode, number>;

    if (config.ncf_fiscal_activo) {
      for (const opcion of NCF_B_TIPO_OPCIONES) {
        const seq = nextBSequences[opcion.codigo];
        if (!Number.isFinite(seq) || seq < 1 || seq > 99999999) {
          setSaveError(
            `La secuencia de ${opcion.codigo} debe ser un numero entre 1 y 99.999.999.`
          );
          setSaving(false);
          return;
        }
      }
    }

    const ncfUpdate = buildTenantNcfUpdatePayload(
      config.ncf_fiscal_activo,
      config.ncf_tipo_default,
      nextBSequences,
      config.ncf_secuencias_por_tipo
    );
    const nextDefaultSequence = ncfUpdate.ncf_secuencia_siguiente;
    const baseUpdate = {
      nombre_negocio: config.nombre_empresa.trim() || "Mi negocio",
      rnc: config.rnc.trim() || null,
      logo_url: config.logo_url.trim() || null,
      direccion: config.direccion.trim() || null,
      telefono: config.telefono.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const currencyUpdateMoneda = {
      moneda: config.currency_code,
    };
    const currencyUpdateCode = {
      currency_code: config.currency_code,
    };
    const billingUpdate = {
      itbis_cobro_por_defecto: config.itbis_cobro_por_defecto,
      ...ncfUpdate,
    };

    let { error } = await insforgeClient.database
      .from("tenants")
      .update({ ...baseUpdate, ...currencyUpdateMoneda, ...billingUpdate })
      .eq("id", tenantId);

    if (error?.message) {
      const retryWithoutCurrency = await insforgeClient.database
        .from("tenants")
        .update({ ...baseUpdate, ...currencyUpdateCode, ...billingUpdate })
        .eq("id", tenantId);
      error = retryWithoutCurrency.error;

      if (!retryWithoutCurrency.error) {
        setConfig((prev) => ({
          ...prev,
          ncf_secuencias_por_tipo: nextBSequences,
          ncf_secuencia_siguiente: nextDefaultSequence,
        }));
        setSaving(false);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 5000);
        return;
      }

      const retryWithoutAnyCurrency = await insforgeClient.database
        .from("tenants")
        .update({ ...baseUpdate, ...billingUpdate })
        .eq("id", tenantId);
      error = retryWithoutAnyCurrency.error;
      if (!retryWithoutAnyCurrency.error) {
        setConfig((prev) => ({
          ...prev,
          ncf_secuencias_por_tipo: nextBSequences,
          ncf_secuencia_siguiente: nextDefaultSequence,
        }));
        setPartialSaveNote(
          "Datos guardados, pero no se pudo persistir la divisa. Revisa columnas `tenants.moneda` o `tenants.currency_code`."
        );
        setSaving(false);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 5000);
        return;
      }

      const retryBaseOnly = await insforgeClient.database
        .from("tenants")
        .update(baseUpdate)
        .eq("id", tenantId);
      error = retryBaseOnly.error;
      if (!retryBaseOnly.error) {
        setPartialSaveNote(
          "Datos basicos guardados. Faltan columnas para guardar NCF, ITBIS por defecto o divisa."
        );
        setSaving(false);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 5000);
        return;
      }
    }

    if (error?.message) {
      setSaveError(error?.message || "Error al guardar. Intenta de nuevo.");
    } else {
      setConfig((prev) => ({
        ...prev,
        ncf_secuencias_por_tipo: nextBSequences,
        ncf_secuencia_siguiente: nextDefaultSequence,
      }));
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    }
    setSaving(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;

    setUploading(true);
    setLogoUploadError("");
    setSavedOk(false);

    const uploaded = await uploadTenantLogoFile(tenantId, file);
    if (!uploaded.ok) {
      setLogoUploadError(uploaded.message);
      setUploading(false);
      e.target.value = "";
      return;
    }

    const saved = await saveTenantLogoUrl(tenantId, uploaded.publicUrl);
    if (!saved.ok) {
      setLogoUploadError(saved.message);
      setUploading(false);
      e.target.value = "";
      return;
    }

    setConfig((prev) => ({ ...prev, logo_url: uploaded.publicUrl }));
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 3000);
    setUploading(false);
    e.target.value = "";
  }

  const tenantPreview: TenantReceiptInfo = useMemo(
    () => ({
      nombre_negocio: config.nombre_empresa.trim() || "Tu negocio",
      rnc: config.rnc.trim() || null,
      direccion: config.direccion.trim() || null,
      telefono: config.telefono.trim() || null,
      logo_url: config.logo_url.trim() || null,
      moneda: config.currency_code,
    }),
    [
      config.nombre_empresa,
      config.rnc,
      config.direccion,
      config.telefono,
      config.logo_url,
      config.currency_code,
    ]
  );

  const thermalPreviewHtml = useMemo(() => {
    void thermalPreviewNonce;
    const { paperWidthMm } = getThermalPrintSettings();
    const nowIso = new Date().toISOString();

    switch (thermalPreviewKind) {
      case "factura":
      default: {
        let sample = { ...SAMPLE_FACTURA_THERMAL_PREVIEW, pagada_at: nowIso };
        if (config.ncf_fiscal_activo) {
          const ncf = construirCadenaNcf(config.ncf_tipo_default, config.ncf_secuencia_siguiente);
          if (ncf) {
            sample = {
              ...sample,
              ncf,
              ncf_tipo: etiquetaTipoNcf(config.ncf_tipo_default),
            };
          }
        }
        return buildFacturaReceiptHtml(tenantPreview, sample, 1, paperWidthMm);
      }
      case "comanda": {
        return buildComandaReceiptHtml(
          tenantPreview,
          { ...SAMPLE_COMANDA_THERMAL, created_at: nowIso },
          paperWidthMm
        );
      }
      case "cierre": {
        const cierreData: CierreDiaThermalData = {
          ...SAMPLE_CIERRE_THERMAL_BASE,
          generadoAtIso: nowIso,
          generadoEn: new Date().toLocaleString("es-DO", {
            timeZone: "America/Santo_Domingo",
          }),
        };
        return buildCierreDiaReceiptHtml(tenantPreview, cierreData, paperWidthMm);
      }
      case "split": {
        const splitSymbol = config.currency_code === "ARS" ? "AR$" : "RD$";
        const rowsP1 =
          buildThermalSplitLineHtml("Plato del menú (ejemplo)", 1, 375.24, config.currency_code) +
          buildThermalSplitLineHtml("Bebida (ejemplo)", 1, 85, config.currency_code);
        const rowsP2 = buildThermalSplitLineHtml("Postre (ejemplo)", 1, 120, config.currency_code);
        return buildSplitTicketHtml(
          tenantPreview,
          [
            {
              personIndex: 1,
              splitParts: 2,
              rowsHtml: rowsP1,
              totalLine: `${splitSymbol} 460.24`,
            },
            {
              personIndex: 2,
              splitParts: 2,
              rowsHtml: rowsP2,
              totalLine: `${splitSymbol} 120.00`,
            },
          ],
          4,
          paperWidthMm
        );
      }
    }
  }, [
    tenantPreview,
    thermalPreviewNonce,
    thermalPreviewKind,
    config.ncf_fiscal_activo,
    config.ncf_tipo_default,
    config.ncf_secuencia_siguiente,
  ]);

  const thermalIframeTitle =
    thermalPreviewKind === "factura"
      ? "Vista previa factura térmica"
      : thermalPreviewKind === "comanda"
        ? "Vista previa comanda térmica"
        : thermalPreviewKind === "cierre"
          ? "Vista previa cierre de día"
          : "Vista previa separar cuenta";

  if (authLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px]">
          Cargando configuración...
        </span>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="font-['Inter',sans-serif] text-[#adaaaa] text-[14px] text-center max-w-md">
          Tu usuario no está vinculado a un negocio. Iniciá sesión con una cuenta de administrador o
          completá el registro de unidad.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 p-4 sm:p-[32px]">
      <div className="mx-auto max-w-[1440px] grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 xl:gap-8 items-start">
        <div className="flex flex-col gap-[24px] min-w-0 order-2 xl:order-1">
          <div className="rounded-[24px] border border-[rgba(255,144,109,0.12)] bg-[linear-gradient(180deg,rgba(24,24,24,0.94)_0%,rgba(19,19,19,0.96)_100%)] px-6 py-6 sm:px-8 sm:py-7 shadow-[0_18px_60px_-30px_rgba(255,144,109,0.32)]">
            <div className="flex flex-col gap-2">
              <span className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.28em] text-[#ff906d]">
                Configuración operativa
              </span>
              <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[28px] sm:text-[34px] leading-none m-0">
                Ajustes del negocio
              </h1>
              <p className="font-['Inter',sans-serif] text-[#8c8c8c] text-[14px] leading-relaxed max-w-3xl m-0">
                Organizá branding, NCF y configuración térmica desde una vista más compacta y alineada.
              </p>
            </div>
          </div>

          {savedOk && (
            <div className="bg-[rgba(89,238,80,0.05)] border border-[rgba(89,238,80,0.2)] rounded-[12px] px-[20px] py-[12px]">
              <span className="font-['Inter',sans-serif] text-[#59ee50] text-[13px]">
                Configuración guardada correctamente.
              </span>
            </div>
          )}

          {partialSaveNote && (
            <div className="bg-[rgba(255,144,109,0.08)] border border-[rgba(255,144,109,0.25)] rounded-[12px] px-[20px] py-[12px]">
              <span className="font-['Inter',sans-serif] text-[#ff906d] text-[13px]">
                {partialSaveNote}
              </span>
            </div>
          )}
          {loadError && (
            <div className="bg-[rgba(255,113,108,0.05)] border border-[rgba(255,113,108,0.2)] rounded-[12px] px-[20px] py-[12px]">
              <span className="font-['Inter',sans-serif] text-[#ff716c] text-[13px]">
                {loadError}
              </span>
            </div>
          )}

          {saveError && (
            <div className="bg-[rgba(255,113,108,0.05)] border border-[rgba(255,113,108,0.2)] rounded-[12px] px-[20px] py-[12px]">
              <span className="font-['Inter',sans-serif] text-[#ff716c] text-[13px]">
                {saveError}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-[24px] items-start">

          <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-[28px] flex flex-col gap-[20px] h-full">
            <div className="flex flex-col gap-[4px]">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">
                Información del Negocio
              </span>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
              <div className="md:col-span-2">
              <Field label="Nombre del Negocio">
                <input
                  type="text"
                  value={config.nombre_empresa}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      nombre_empresa: e.target.value,
                    }))
                  }
                  placeholder="ej. CyberBistro"
                  className="input-field"
                />
              </Field>
              </div>
              <Field label="RNC">
                <input
                  type="text"
                  value={config.rnc}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, rnc: e.target.value }))
                  }
                  placeholder="000-00000-0"
                  className="input-field"
                />
              </Field>
              <Field label="Dirección">
                <input
                  type="text"
                  value={config.direccion}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, direccion: e.target.value }))
                  }
                  placeholder="Calle, ciudad (opcional)"
                  className="input-field"
                />
              </Field>
              <Field label="Teléfono">
                <input
                  type="text"
                  value={config.telefono}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, telefono: e.target.value }))
                  }
                  placeholder="809-000-0000"
                  className="input-field"
                />
              </Field>
              <Field label="Divisa">
                <select
                  value={config.currency_code}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      currency_code: e.target.value === "ARS" ? "ARS" : "DOP",
                    }))
                  }
                  className="input-field cursor-pointer"
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-[28px] flex flex-col gap-[20px] h-full">
            <div className="flex flex-col gap-[4px]">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">
                Comprobante fiscal (NCF)
              </span>

            </div>

            <div className="rounded-[14px] border border-[rgba(72,72,71,0.22)] bg-[#1a1a1a] px-[16px] py-[14px] flex flex-col gap-[10px]">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.itbis_cobro_por_defecto}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      itbis_cobro_por_defecto: e.target.checked,
                    }))
                  }
                  className="mt-[2px] size-4 rounded border-[rgba(72,72,71,0.5)] accent-[#59ee50]"
                />
                <span className="font-['Inter',sans-serif] text-[14px] text-white leading-snug">
                  Activar ITBIS por defecto al cobrar
                </span>
              </label>
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px] leading-relaxed">
                Venta y Mesas arrancan con el switch de ITBIS en el estado que elijas aqui, pero puedes cambiarlo manualmente en cada cobro.
              </span>
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.ncf_fiscal_activo}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, ncf_fiscal_activo: e.target.checked }))
                }
                className="size-4 rounded border-[rgba(72,72,71,0.5)] accent-[#ff906d]"
              />
              <span className="font-['Inter',sans-serif] text-[14px] text-white">
                Asignar NCF automáticamente al cobrar
              </span>
            </label>

            <Field label="Tipo de comprobante">
              <select
                value={config.ncf_tipo_default}
                onChange={(e) =>
                  setConfig((prev) => {
                    const nextType = (isNcfBCode(e.target.value)
                      ? e.target.value
                      : DEFAULT_NCF_B_CODE) as NcfBCode;
                    return {
                      ...prev,
                      ncf_tipo_default: nextType,
                      ncf_secuencia_siguiente: prev.ncf_secuencias_por_tipo[nextType] ?? 1,
                    };
                  })
                }
                disabled={!config.ncf_fiscal_activo}
                className="input-field disabled:opacity-50"
              >
                {NCF_B_TIPO_OPCIONES.map((o) => (
                  <option key={o.codigo} value={o.codigo}>
                    {o.descripcion}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Secuencias configuradas por tipo B">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]">
                {NCF_B_TIPO_OPCIONES.map((o) => (
                  <div
                    key={o.codigo}
                    className="rounded-[12px] border border-[rgba(72,72,71,0.22)] bg-[#1a1a1a] px-[14px] py-[12px] flex flex-col gap-[8px]"
                  >
                    <div className="flex items-center justify-between gap-[12px]">
                      <span className="font-['Space_Grotesk',sans-serif] text-white text-[14px] font-bold">
                        {o.codigo}
                      </span>
                      <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px]">
                        {config.ncf_tipo_default === o.codigo ? "Predeterminado" : "Disponible"}
                      </span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={99999999}
                      value={config.ncf_secuencias_por_tipo[o.codigo]}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        const nextValue = Number.isFinite(v) ? v : 1;
                        setConfig((prev) => {
                          const nextSequences = {
                            ...prev.ncf_secuencias_por_tipo,
                            [o.codigo]: nextValue,
                          };
                          return {
                            ...prev,
                            ncf_secuencias_por_tipo: nextSequences,
                            ncf_secuencia_siguiente:
                              o.codigo === prev.ncf_tipo_default
                                ? nextValue
                                : prev.ncf_secuencia_siguiente,
                          };
                        });
                      }}
                      disabled={!config.ncf_fiscal_activo}
                      className="input-field disabled:opacity-50"
                    />
                    <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px] leading-relaxed">
                      {o.descripcion}
                    </span>
                  </div>
                ))}
              </div>
            </Field>

            {config.ncf_fiscal_activo ? (
              <p className="font-['Inter',sans-serif] text-[13px] text-[#59ee50] m-0">
                {(() => {
                  const ncf = construirCadenaNcf(
                    config.ncf_tipo_default,
                    config.ncf_secuencia_siguiente
                  );
                  return ncf
                    ? `Vista previa — próximo NCF: ${ncf}`
                    : "Revisá el tipo (B01, E32…) y la secuencia.";
                })()}
              </p>
            ) : null}
          </div>

          <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-[28px] flex flex-col gap-[16px] 2xl:col-span-2">
            <div className="flex flex-col gap-[4px]">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">
                Vista previa — tickets térmicos
              </span>

            </div>
            <div className="flex gap-[12px] overflow-x-auto pb-[4px] shrink-0 -mx-[4px] px-[4px]">
              {THERMAL_PREVIEW_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setThermalPreviewKind(tab.id)}
                  className="px-[24px] py-[10px] rounded-[12px] shrink-0 font-['Space_Grotesk',sans-serif] font-bold text-[14px] tracking-[1.2px] uppercase border-none cursor-pointer transition-all"
                  style={{
                    backgroundColor:
                      thermalPreviewKind === tab.id ? "#ff906d" : "#201f1f",
                    color: thermalPreviewKind === tab.id ? "#0e0e0e" : "#adaaaa",
                    boxShadow:
                      thermalPreviewKind === tab.id
                        ? "0 0 16px rgba(255,144,109,0.2)"
                        : undefined,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="rounded-[14px] border border-[rgba(72,72,71,0.35)] bg-[#1e1e1e] overflow-hidden flex justify-center p-[16px] min-h-[200px]">
              <iframe
                title={thermalIframeTitle}
                srcDoc={thermalPreviewHtml}
                className="bg-white rounded-[4px] shadow-[0_8px_32px_rgba(0,0,0,0.35)] border-0"
                style={{
                  width: "80mm",
                  minHeight: "420px",
                  maxHeight: "560px",
                  transform: "scale(1.05)",
                  transformOrigin: "top center",
                }}
              />
            </div>
          </div>

          <div className="2xl:col-span-2 grid grid-cols-1 2xl:grid-cols-2 gap-[24px]">
            <AppDesktopUpdateCard />

            <ThermalPrintSettingsCard
              onThermalSaved={() => setThermalPreviewNonce((n) => n + 1)}
            />
          </div>

          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#ff906d] rounded-[12px] px-[28px] py-[14px] font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[15px] tracking-[0.5px] uppercase cursor-pointer border-none shadow-[0px_0px_20px_0px_rgba(255,144,109,0.3)] transition-opacity disabled:opacity-50 self-start"
          >
            {saving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>

        <aside className="min-w-0 order-1 xl:order-2 xl:sticky xl:top-4 xl:self-start">
          <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-[28px] flex flex-col gap-[20px]">
            <div className="flex flex-col gap-[4px]">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">
                Logo del Negocio
              </span>

            </div>

            {logoUploadError && (
              <div className="bg-[rgba(255,113,108,0.05)] border border-[rgba(255,113,108,0.2)] rounded-[12px] px-[20px] py-[12px]">
                <span className="font-['Inter',sans-serif] text-[#ff716c] text-[13px]">
                  {logoUploadError}
                </span>
              </div>
            )}

            {config.logo_url ? (
              <div className="bg-[#1a1a1a] rounded-[12px] p-[20px] flex items-center justify-center min-h-[100px] border border-[rgba(72,72,71,0.2)]">
                <img
                  src={config.logo_url}
                  alt="Logo del negocio"
                  className="max-h-[100px] max-w-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            ) : (
              <div className="bg-[#1a1a1a] rounded-[12px] p-[20px] flex items-center justify-center min-h-[100px] border border-dashed border-[rgba(72,72,71,0.3)]">
                <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
                  Sin logo configurado
                </span>
              </div>
            )}

            <Field label="URL del Logo">
              <input
                type="url"
                value={config.logo_url}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, logo_url: e.target.value }))
                }
                placeholder="https://ejemplo.com/logo.png"
                className="input-field"
              />
            </Field>

            <div className="flex items-center gap-[12px]">
              <div className="h-px flex-1 bg-[rgba(72,72,71,0.25)]" />
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px]">
                o subí un archivo
              </span>
              <div className="h-px flex-1 bg-[rgba(72,72,71,0.25)]" />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-[#262626] rounded-[12px] border border-[rgba(72,72,71,0.3)] px-[24px] py-[12px] font-['Inter',sans-serif] text-[#adaaaa] text-[13px] cursor-pointer transition-colors disabled:opacity-50 text-center w-full"
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = "rgba(255,144,109,0.3)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = "rgba(72,72,71,0.3)")
              }
            >
              {uploading ? "Subiendo..." : "Seleccionar imagen"}
            </button>
          </div>

          <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-[24px] flex flex-col gap-[16px]">
            <div className="flex flex-col gap-[4px]">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">
                Resumen rapido
              </span>
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px] leading-relaxed">
                Estado actual del negocio y de la emisión fiscal.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[14px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.2)] px-4 py-4">
                <div className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#6b7280]">
                  Divisa
                </div>
                <div className="font-['Space_Grotesk',sans-serif] text-white text-[18px] font-bold mt-2">
                  {config.currency_code}
                </div>
              </div>
              <div className="rounded-[14px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.2)] px-4 py-4">
                <div className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#6b7280]">
                  NCF
                </div>
                <div className="font-['Space_Grotesk',sans-serif] text-white text-[18px] font-bold mt-2">
                  {config.ncf_fiscal_activo ? "Activo" : "Off"}
                </div>
              </div>
              <div className="rounded-[14px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.2)] px-4 py-4">
                <div className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#6b7280]">
                  ITBIS default
                </div>
                <div className="font-['Space_Grotesk',sans-serif] text-white text-[18px] font-bold mt-2">
                  {config.itbis_cobro_por_defecto ? "Activo" : "Off"}
                </div>
              </div>
              <div className="rounded-[14px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.2)] px-4 py-4 col-span-2">
                <div className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#6b7280]">
                  Proximo comprobante
                </div>
                <div className="font-['Space_Grotesk',sans-serif] text-white text-[16px] font-bold mt-2 break-all">
                  {config.ncf_fiscal_activo
                    ? construirCadenaNcf(config.ncf_tipo_default, config.ncf_secuencia_siguiente) || "Sin definir"
                    : "NCF desactivado"}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        .input-field {
          width: 100%;
          background: #1a1a1a;
          border: 1px solid rgba(72,72,71,0.3);
          border-radius: 10px;
          padding: 12px 16px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: white;
          outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .input-field:focus {
          border-color: rgba(255,144,109,0.4);
        }
        .input-field::placeholder {
          color: rgba(107,114,128,0.8);
        }
      `}</style>
    </div>
  );
}

function AppDesktopUpdateCard() {
  const { phase, remoteVersion, downloadPercent, checkForUpdates } = useAppUpdate();
  const isElectron = Boolean(window.electronAPI?.checkForUpdates);

  const statusLine = (() => {
    if (!isElectron) {
      return "Las actualizaciones automáticas están disponibles solo en la app instalada para Windows.";
    }
    switch (phase) {
      case "checking":
        return "Buscando una versión más reciente en el servidor…";
      case "available":
        return remoteVersion
          ? `Versión ${remoteVersion} encontrada. Aceptá la actualización desde la tarjeta flotante para iniciar descarga.`
          : "Nueva versión encontrada. Aceptá la actualización desde la tarjeta flotante para iniciar descarga.";
      case "downloading":
        return `Descargando actualización… ${downloadPercent ?? 0}%`;
      case "ready":
        return remoteVersion
          ? `Listo para instalar: ${remoteVersion}. Reiniciá la app cuando quieras.`
          : "Actualización descargada. Reiniciá la app para instalar.";
      case "unsupported":
        return "No se pudo iniciar el comprobador de actualizaciones en este entorno.";
      default:
        return "Al abrir la app se busca una versión nueva automáticamente. Podés comprobar manualmente abajo.";
    }
  })();

  return (
    <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-[28px] flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[4px]">
        <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">
          Actualizaciones de la app
        </span>
        <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
          Versión instalada <span className="text-[#adaaaa]">{__APP_VERSION__}</span>. Las
          descargas usan el mismo canal que la instalación (GitHub Releases).
        </span>
      </div>
      <p className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px] leading-relaxed m-0">
        {statusLine}
      </p>
      {isElectron ? (
        <button
          type="button"
          onClick={checkForUpdates}
          disabled={phase === "checking"}
          className="bg-[#262626] rounded-[12px] border border-[rgba(255,144,109,0.35)] px-[24px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[13px] tracking-[0.5px] uppercase cursor-pointer self-start disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {phase === "checking" ? "Buscando…" : "Buscar actualizaciones"}
        </button>
      ) : null}
    </div>
  );
}

function ThermalPrintSettingsCard({
  onThermalSaved,
}: {
  onThermalSaved?: () => void;
}) {
  const [paperWidthMm, setPaperWidthMm] = useState<PaperWidthMm>(80);
  const [printerName, setPrinterName] = useState("");
  const [printers, setPrinters] = useState<ThermalPrinterInfo[]>([]);
  const [thermalSaved, setThermalSaved] = useState(false);
  const [loadingPrinters, setLoadingPrinters] = useState(false);

  useEffect(() => {
    const s = getThermalPrintSettings();
    setPaperWidthMm(s.paperWidthMm);
    setPrinterName(s.printerName);
  }, []);

  async function refreshPrinters() {
    if (!window.electronAPI?.listPrinters) {
      setPrinters([]);
      return;
    }
    setLoadingPrinters(true);
    try {
      const list = await window.electronAPI.listPrinters();
      setPrinters(list);
    } catch {
      setPrinters([]);
    } finally {
      setLoadingPrinters(false);
    }
  }

  useEffect(() => {
    void refreshPrinters();
  }, []);

  function handleSaveThermal() {
    saveThermalPrintSettings({ paperWidthMm, printerName });
    onThermalSaved?.();
    setThermalSaved(true);
    setTimeout(() => setThermalSaved(false), 2500);
  }

  const isElectron = Boolean(window.electronAPI?.listPrinters);

  return (
    <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-[28px] flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[4px]">
        <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">
          Impresión térmica
        </span>
        <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
          Ancho del rollo, impresora y datos del negocio (arriba) se usan en facturas de venta y comandas de cocina. La configuración se guarda en este equipo (localStorage).
        </span>
      </div>

      <Field label="Ancho del papel">
        <div className="flex gap-[12px] flex-wrap">
          {([80, 88] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setPaperWidthMm(w)}
              className={`rounded-[10px] px-[18px] py-[10px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase border cursor-pointer transition-colors ${
                paperWidthMm === w
                  ? "bg-[rgba(255,144,109,0.15)] border-[#ff906d] text-[#ff906d]"
                  : "bg-[#1a1a1a] border-[rgba(72,72,71,0.3)] text-[#adaaaa]"
              }`}
            >
              {w} mm
            </button>
          ))}
        </div>
      </Field>

      {isElectron ? (
        <>
          <div className="flex flex-wrap items-center gap-[12px]">
            <button
              type="button"
              onClick={() => void refreshPrinters()}
              disabled={loadingPrinters}
              className="bg-[#262626] rounded-[10px] border border-[rgba(72,72,71,0.3)] px-[16px] py-[10px] font-['Inter',sans-serif] text-[#adaaaa] text-[12px] cursor-pointer disabled:opacity-50"
            >
              {loadingPrinters ? "Buscando…" : "Actualizar impresoras"}
            </button>
            <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px]">
              Impresoras detectadas en Windows (Electron).
            </span>
          </div>
          <Field label="Impresora térmica">
            <select
              value={printerName}
              onChange={(e) => setPrinterName(e.target.value)}
              className="input-field cursor-pointer"
            >
              <option value="">Predeterminada del sistema</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName || p.name}
                  {p.isDefault ? " (predeterminada)" : ""}
                </option>
              ))}
            </select>
          </Field>
        </>
      ) : (
        <p className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
          En el navegador se abre el cuadro de impresión del sistema. En la app de escritorio (Electron) podés elegir la impresora térmica directamente.
        </p>
      )}

      {thermalSaved && (
        <div className="bg-[rgba(89,238,80,0.05)] border border-[rgba(89,238,80,0.2)] rounded-[10px] px-[16px] py-[10px]">
          <span className="font-['Inter',sans-serif] text-[#59ee50] text-[13px]">
            Configuración de impresión guardada en este equipo.
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={handleSaveThermal}
        className="bg-[#262626] rounded-[12px] border border-[rgba(255,144,109,0.35)] px-[24px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[13px] tracking-[0.5px] uppercase cursor-pointer self-start"
      >
        Guardar impresión
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[8px]">
      <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

