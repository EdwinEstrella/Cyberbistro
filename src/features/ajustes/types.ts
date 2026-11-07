export interface AjustesConfig {
  nombre_empresa: string;
  rnc: string;
  logo_url: string;
  logo_size_px: number;
  logo_offset_x: number;
  logo_offset_y: number;
  menu_url: string;
  direccion: string;
  telefono: string;
  currency_code: "DOP" | "ARS";
  itbis_cobro_por_defecto: boolean;
  itbis_incluido_en_precio: boolean;
  propina_cobro_por_defecto: boolean;
  ncf_fiscal_activo: boolean;
  fiscal_mode: "internal_receipt" | "ncf_legacy" | "dgii_ecf";
  fiscal_mode_fallback: "internal_receipt" | "ncf_legacy";
  ecf_environment: "test" | "certification" | "production";
  ncf_tipo_default: string;
  ncf_secuencia_siguiente: number;
  ncf_secuencias_por_tipo: Record<string, number>;
  ncf_tipos_activos: Record<string, boolean>;
}

export type ThermalPreviewKind = "factura" | "nota_credito" | "comanda" | "cierre" | "split" | "nomina";

export const THERMAL_PREVIEW_TABS: { id: ThermalPreviewKind; label: string }[] = [
  { id: "factura", label: "Factura" },
  { id: "nota_credito", label: "Nota de crédito" },
  { id: "comanda", label: "Comanda" },
  { id: "cierre", label: "Cierre" },
  { id: "split", label: "Separar cuenta" },
  { id: "nomina", label: "Nómina" },
];

export const CURRENCY_OPTIONS: Array<{ code: AjustesConfig["currency_code"]; label: string }> = [
  { code: "DOP", label: "Peso dominicano (RD$)" },
  { code: "ARS", label: "Peso argentino (AR$)" },
];
