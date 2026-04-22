import type { PaperWidthMm } from "./thermalStorage";

export interface TenantReceiptInfo {
  nombre_negocio: string | null;
  rnc: string | null;
  direccion: string | null;
  telefono: string | null;
  logo_url: string | null;
  moneda?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function thermalStyles(paperWidthMm: PaperWidthMm): string {
  const bodyMax = paperWidthMm === 88 ? "80mm" : "72mm";
  return `
    @page { size: ${paperWidthMm}mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: Consolas, 'Courier New', Courier, monospace;
      font-size: 16px;
      font-weight: 600;
      line-height: 1.35;
      width: ${bodyMax};
      max-width: ${bodyMax};
      margin: 0 auto;
      padding: 2mm;
      color: #000;
      background: #fff;
    }
    h1 { text-align: center; font-size: 21px; margin: 0 0 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
    h2 { text-align: center; font-size: 17px; margin: 0 0 6px; font-weight: 700; letter-spacing: 0.5px; }
    .center { text-align: center; }
    .divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    .double-divider { border: none; border-top: 3px double #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    .header-row td { padding: 3px 0; font-size: 14px; font-weight: 600; }
    .total { font-weight: 700; font-size: 17px; }
    .total-xl td { font-weight: 700; font-size: 20px; padding-top: 4px; }
    .footer { text-align: center; font-size: 13px; margin-top: 8px; font-weight: 600; }
    .logo-wrap { text-align: center; margin-bottom: 8px; }
    .logo-wrap img { max-width: 100%; max-height: 52px; object-fit: contain; }
    .item-row td { padding: 3px 0; vertical-align: top; }
    .fdo-company-line { text-align: center; font-size: 14px; margin: 2px 0; font-weight: 600; }
    .fdo-items-head th { text-align: left; font-size: 14px; padding: 5px 0 3px; border-bottom: 2px solid #000; font-weight: 700; }
    .fdo-items-head th.r { text-align: right; }
    .fdo-items-head th.c { text-align: center; }
    .fdo-item-name { font-weight: 700; padding-top: 5px; font-size: 16px; }
    .fdo-item-sub td { font-size: 14px; padding: 2px 0 3px; font-weight: 600; }
    .fdo-pay-row td { font-size: 14px; padding: 3px 0; font-weight: 600; }
  `;
}

function headerBlock(t: TenantReceiptInfo, opts?: { omitRnc?: boolean }): string {
  const nombre = escapeHtml(t.nombre_negocio || "CyberBistro");
  const logo = t.logo_url
    ? `<div class="logo-wrap"><img src="${escapeHtml(t.logo_url)}" alt="" crossorigin="anonymous" /></div>`
    : "";
  const rncTrim = t.rnc?.trim() ?? "";
  const rnc =
    !opts?.omitRnc && rncTrim
      ? `<p class="fdo-company-line" style="font-weight:bold">RNC: ${escapeHtml(rncTrim)}</p>`
      : "";
  const dir = t.direccion
    ? `<p class="fdo-company-line">${escapeHtml(t.direccion)}</p>`
    : "";
  const tel = t.telefono
    ? `<p class="fdo-company-line">Tel: ${escapeHtml(t.telefono)}</p>`
    : "";
  return `${logo}<h1>${nombre}</h1>${rnc}${dir}${tel}`;
}

/** Fecha/hora República Dominicana (misma idea que FacturaDo-Taller). */
function formatFacturaDateParts(iso: string | undefined | null): { date: string; time: string } {
  const d = new Date(iso || Date.now());
  const date = new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const time = new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return { date, time };
}

function tenantCurrencyCode(tenant: TenantReceiptInfo): "DOP" | "ARS" {
  return String(tenant.moneda || "").trim().toUpperCase() === "ARS" ? "ARS" : "DOP";
}

function currencySymbol(tenant: TenantReceiptInfo): string {
  return tenantCurrencyCode(tenant) === "ARS" ? "AR$" : "RD$";
}

function currencyLocale(tenant: TenantReceiptInfo): string {
  return tenantCurrencyCode(tenant) === "ARS" ? "es-AR" : "es-DO";
}

function rdFixed(n: number, tenant: TenantReceiptInfo): string {
  return `${currencySymbol(tenant)} ${Number(n).toFixed(2)}`;
}

export function buildFacturaReceiptHtml(
  tenant: TenantReceiptInfo,
  factura: {
    items: Array<{ cantidad: number; nombre: string; categoria?: string; precio_unitario?: number; subtotal?: number }>;
    subtotal: number;
    itbis: number;
    total: number;
    metodo_pago: string;
    mesa_numero: number | null;
    notas: string | null;
    pagada_at?: string | null;
    created_at?: string;
    /** Cobro / facturación electrónica ticket (estilo FacturaDo). */
    estado?: "pagada" | "pendiente" | "cancelada" | string;
    propina?: number;
    cliente_nombre?: string | null;
    cliente_rnc?: string | null;
    ncf?: string | null;
    ncf_tipo?: string | null;
  },
  numeroFactura: number,
  paperWidthMm: PaperWidthMm
): string {
  const when = factura.pagada_at || factura.created_at || new Date().toISOString();
  const { date: fechaStr, time: horaStr } = formatFacturaDateParts(when);
  const mesaLabel =
    factura.mesa_numero != null && factura.mesa_numero !== 0
      ? String(factura.mesa_numero)
      : "Para llevar";

  const estadoRaw = (factura.estado || "pagada").toLowerCase();
  const estadoEtiqueta =
    estadoRaw === "pagada" ? "PAGADO" : estadoRaw === "pendiente" ? "PENDIENTE" : estadoRaw === "cancelada" ? "CANCELADA" : String(factura.estado || "").toUpperCase();

  const clienteRnc = (factura.cliente_rnc || "").trim();
  const ncf = (factura.ncf || "").trim();
  const propina = Number(factura.propina ?? 0);

  const itemsRows = factura.items
    .map((item) => {
      const qty = item.cantidad;
      const pu = Number(item.precio_unitario ?? 0);
      const line = Number(item.subtotal ?? qty * pu);
      const precioStr = rdFixed(pu, tenant);
      const categoria = (item.categoria || "").trim();
      const categoriaRow =
        categoria !== ""
          ? `<tr><td colspan="3" style="font-size:13px;font-weight:700;padding-top:5px;padding-bottom:0">${escapeHtml(categoria)}</td></tr>`
          : "";
      return `
    ${categoriaRow}
    <tr><td colspan="3" class="fdo-item-name" style="padding-top:${categoria !== "" ? "1px" : "5px"}">${escapeHtml(item.nombre)}</td></tr>
    <tr class="fdo-item-sub">
      <td colspan="2">${precioStr} × ${qty}</td>
      <td style="text-align:right;font-weight:bold">${rdFixed(line, tenant)}</td>
    </tr>`;
    })
    .join("");

  const metaCliente =
    clienteRnc !== ""
      ? `<tr class="header-row"><td>RNC/Céd.</td><td style="text-align:right">${escapeHtml(clienteRnc)}</td></tr>`
      : "";
  const metaNcf =
    ncf !== ""
      ? `<tr class="header-row"><td>NCF</td><td style="text-align:right;font-weight:bold;font-size:14px">${escapeHtml(ncf)}</td></tr>`
      : "";

  const propinaRow =
    propina > 0
      ? `<tr><td>Propina</td><td style="text-align:right">${rdFixed(propina, tenant)}</td></tr>`
      : "";

  const body = `
  ${headerBlock(tenant)}
  <div class="divider"></div>
  <table>
    <tr class="header-row"><td><strong>Factura</strong></td><td style="text-align:right;font-weight:bold">#${String(numeroFactura).padStart(6, "0")}</td></tr>
    <tr class="header-row"><td>Fecha</td><td style="text-align:right">${escapeHtml(fechaStr)}</td></tr>
    <tr class="header-row"><td>Hora</td><td style="text-align:right">${escapeHtml(horaStr)}</td></tr>
    ${metaCliente}
    ${metaNcf}
    <tr class="header-row"><td>Mesa</td><td style="text-align:right">${escapeHtml(mesaLabel)}</td></tr>
    <tr class="header-row"><td>Método</td><td style="text-align:right">${escapeHtml(factura.metodo_pago.toUpperCase())}</td></tr>
  </table>
  <div class="divider"></div>
  <table>
    <thead class="fdo-items-head"><tr><th>Desc</th><th class="r">Cant</th><th class="r">Total</th></tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>
  <div class="divider"></div>
  <table>
    <tr><td>Subtotal</td><td style="text-align:right">${rdFixed(factura.subtotal, tenant)}</td></tr>
    <tr><td>ITBIS</td><td style="text-align:right">${rdFixed(factura.itbis, tenant)}</td></tr>
    ${propinaRow}
    <tr class="total-xl"><td>TOTAL</td><td style="text-align:right">${rdFixed(factura.total, tenant)}</td></tr>
  </table>
  <div class="divider"></div>
  <table>
    <tr class="fdo-pay-row"><td>Estado</td><td style="text-align:right;font-weight:bold">${escapeHtml(estadoEtiqueta)}</td></tr>
  </table>
  ${factura.notas ? `<div class="divider"></div><div style="font-size:14px;font-weight:600"><b>Notas:</b> ${escapeHtml(factura.notas)}</div>` : ""}
  <div class="double-divider"></div>
  <div class="footer">
    <p style="margin:0 0 4px">¡Gracias por su compra!</p>
  </div>
  <div class="divider"></div>
  <div class="center" style="font-size:13px;font-weight:600">${escapeHtml(new Date().toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" }))}</div>
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Factura</title><style>${thermalStyles(paperWidthMm)}</style></head><body>${body}</body></html>`;
}

export function buildComandaReceiptHtml(
  tenant: TenantReceiptInfo,
  comanda: {
    id: string;
    numero_comanda?: number | null;
    mesa_numero: number | null;
    items: Array<{ nombre: string; cantidad: number; precio?: number; categoria?: string; notas?: string }>;
    notas?: string | null;
    created_at?: string | null;
  },
  paperWidthMm: PaperWidthMm
): string {
  const when = comanda.created_at || new Date().toISOString();
  const { date: fechaStr, time: horaStr } = formatFacturaDateParts(when);
  const num =
    comanda.numero_comanda != null
      ? String(comanda.numero_comanda).padStart(4, "0")
      : comanda.id.slice(0, 8).toUpperCase();
  const mesaLabel =
    comanda.mesa_numero != null && comanda.mesa_numero !== 0
      ? String(comanda.mesa_numero)
      : comanda.mesa_numero === 0
        ? "Para llevar"
        : "—";

  const rows = comanda.items
    .map((it) => {
      const cat = (it.categoria || "").trim();
      const catCell =
        cat !== ""
          ? `<span style="font-size:14px">[${escapeHtml(cat)}]</span>`
          : `<span style="font-size:14px">—</span>`;
      const notasLine = (it.notas || "").trim()
        ? `<tr><td colspan="2" class="fdo-item-sub" style="padding-top:0;padding-bottom:6px;font-size:13px">↳ ${escapeHtml(
            (it.notas || "").trim()
          )}</td></tr>`
        : "";
      return `
    <tr><td colspan="2" class="fdo-item-name">${escapeHtml(it.nombre)}</td></tr>
    <tr class="fdo-item-sub">
      <td>${catCell}</td>
      <td style="text-align:right;font-weight:bold;font-size:17px">${it.cantidad}×</td>
    </tr>${notasLine}`;
    })
    .join("");

  const body = `
  ${headerBlock(tenant)}
  <div class="divider"></div>
  <h2>COMANDA — COCINA</h2>
  <table>
    <tr class="header-row"><td><strong>Comanda</strong></td><td style="text-align:right;font-weight:bold">#${escapeHtml(num)}</td></tr>
    <tr class="header-row"><td>Fecha</td><td style="text-align:right">${escapeHtml(fechaStr)}</td></tr>
    <tr class="header-row"><td>Hora</td><td style="text-align:right">${escapeHtml(horaStr)}</td></tr>
    <tr class="header-row"><td>Mesa</td><td style="text-align:right;font-weight:bold">${escapeHtml(mesaLabel)}</td></tr>
  </table>
  <div class="divider"></div>
  <table>
    <thead class="fdo-items-head"><tr><th>Plato</th><th class="r">Cant.</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${comanda.notas ? `<div class="divider"></div><div style="font-size:14px;font-weight:600"><b>Nota cocina:</b> ${escapeHtml(comanda.notas)}</div>` : ""}
  <div class="double-divider"></div>
  <div class="footer">
    <p style="margin:0 0 4px">Preparar en orden de llegada</p>
    <p style="margin:0;font-size:13px;font-weight:600">CyberBistro OS</p>
  </div>
  <div class="divider"></div>
  <div class="center" style="font-size:13px;font-weight:600">${escapeHtml(new Date().toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" }))}</div>
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comanda</title><style>${thermalStyles(paperWidthMm)}</style></head><body>${body}</body></html>`;
}

/** Una línea de ítem para ticket de separar cuenta (mismo estilo que factura térmica). */
export function buildThermalSplitLineHtml(
  platoNombre: string,
  cantidad: number,
  importeLinea: number,
  currencyCode: "DOP" | "ARS" = "DOP"
): string {
  const line = Number(importeLinea);
  const symbol = currencyCode === "ARS" ? "AR$" : "RD$";
  return `
    <tr><td colspan="2" class="fdo-item-name">${escapeHtml(platoNombre)}</td></tr>
    <tr class="fdo-item-sub">
      <td>${cantidad}×</td>
      <td style="text-align:right;font-weight:bold">${symbol} ${line.toFixed(2)}</td>
    </tr>`;
}

function splitSection(
  tenant: TenantReceiptInfo,
  opts: {
    mesaNumero: number | null;
    personIndex: number;
    splitParts: number;
    rowsHtml: string;
    totalLine: string;
    pageBreakBefore: boolean;
  }
): string {
  const mesa = opts.mesaNumero != null ? `Mesa ${opts.mesaNumero}` : "Para llevar";
  const br = opts.pageBreakBefore ? ' style="page-break-before:always"' : "";
  return `
  <section${br}>
  ${headerBlock(tenant)}
  <div class="divider"></div>
  <h2>SEPARAR CUENTA</h2>
  <table>
    <tr class="header-row"><td>Ubicación</td><td style="text-align:right;font-weight:bold">${escapeHtml(mesa)}</td></tr>
    <tr class="header-row"><td>Parte</td><td style="text-align:right;font-weight:bold">Persona ${opts.personIndex} de ${opts.splitParts}</td></tr>
  </table>
  <div class="divider"></div>
  <table>
    <thead class="fdo-items-head"><tr><th>Concepto</th><th class="r">Importe</th></tr></thead>
    <tbody>${opts.rowsHtml}</tbody>
  </table>
  <div class="divider"></div>
  <table><tr class="total-xl"><td>TOTAL</td><td style="text-align:right">${opts.totalLine}</td></tr></table>
  <div class="double-divider"></div>
  <div class="footer" style="font-size:13px">CyberBistro OS — cuenta dividida</div>
  </section>`;
}

/** Varias copias de cuenta dividida en un solo documento (saltos de página entre personas). */
export function buildSplitTicketHtml(
  tenant: TenantReceiptInfo,
  parts: Array<{ personIndex: number; splitParts: number; rowsHtml: string; totalLine: string }>,
  mesaNumero: number | null,
  paperWidthMm: PaperWidthMm
): string {
  const sections = parts.map((p, i) =>
    splitSection(tenant, {
      ...p,
      mesaNumero,
      pageBreakBefore: i > 0,
    })
  );
  const body = sections.join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Split</title><style>${thermalStyles(paperWidthMm)}</style></head><body>${body}</body></html>`;
}

/** Resumen para ticket térmico de cierre de día / caja. */
export interface CierreDiaThermalData {
  /** Fecha del día operativo (texto local). */
  fechaOperacion: string;
  cicloNumero?: number;
  /** Momento en que se generó el reporte (texto, respaldo). */
  generadoEn: string;
  /** ISO para Fecha/Hora en zona DO (misma lógica que factura/comanda). */
  generadoAtIso?: string;
  abiertoAtIso?: string;
  cerradoAtIso?: string;
  facturasPagadas: number;
  facturasPendientes: number;
  facturasCanceladas: number;
  totalPagado: number;
  subtotalPagado: number;
  itbisPagado: number;
  /** Filas ordenadas para el ticket. */
  porMetodo: Array<{ etiqueta: string; cantidad: number; total: number }>;
  ticketPromedioPagado: number;
  /** Consumos sin facturar al momento del cierre (cuentas abiertas en POS). */
  cuentasAbiertasLineas?: number;
  cuentasAbiertasMesas?: number;
  cuentasAbiertasSubtotal?: number;
  cuentasAbiertasItbisEst?: number;
  cuentasAbiertasTotalEst?: number;
}

function rd(n: number, tenant: TenantReceiptInfo): string {
  return `${currencySymbol(tenant)} ${Number(n).toLocaleString(currencyLocale(tenant), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function buildCierreDiaReceiptHtml(
  tenant: TenantReceiptInfo,
  data: CierreDiaThermalData,
  paperWidthMm: PaperWidthMm
): string {
  const metodoRows = data.porMetodo
    .map(
      (m) => `
    <tr class="fdo-item-sub">
      <td style="width:55%">${escapeHtml(m.etiqueta)}</td>
      <td style="width:20%;text-align:center;font-weight:bold">${m.cantidad}</td>
      <td style="width:25%;text-align:right;font-weight:bold">${rd(m.total, tenant)}</td>
    </tr>`
    )
    .join("");

  const genIso = data.generadoAtIso?.trim();
  const genParts = genIso ? formatFacturaDateParts(genIso) : null;
  const abiertoParts = data.abiertoAtIso?.trim() ? formatFacturaDateParts(data.abiertoAtIso) : null;
  const cerradoParts = data.cerradoAtIso?.trim() ? formatFacturaDateParts(data.cerradoAtIso) : null;
  const generadoRows = genParts
    ? `
    <tr class="header-row"><td>Impreso — Fecha</td><td style="text-align:right;font-size:14px">${escapeHtml(genParts.date)}</td></tr>
    <tr class="header-row"><td>Impreso — Hora</td><td style="text-align:right;font-size:14px">${escapeHtml(genParts.time)}</td></tr>`
    : `<tr class="header-row"><td>Generado</td><td style="text-align:right;font-size:14px">${escapeHtml(data.generadoEn)}</td></tr>`;
  const cicloRows = `
    ${
      data.cicloNumero != null
        ? `<tr class="header-row"><td>Ciclo</td><td style="text-align:right;font-weight:bold;font-size:14px">#${data.cicloNumero}</td></tr>`
        : ""
    }
    ${
      abiertoParts
        ? `<tr class="header-row"><td>Apertura</td><td style="text-align:right;font-size:14px">${escapeHtml(abiertoParts.date)} ${escapeHtml(abiertoParts.time)}</td></tr>`
        : ""
    }
    ${
      cerradoParts
        ? `<tr class="header-row"><td>Cierre</td><td style="text-align:right;font-size:14px">${escapeHtml(cerradoParts.date)} ${escapeHtml(cerradoParts.time)}</td></tr>`
        : ""
    }`;

  const body = `
  ${headerBlock(tenant)}
  <div class="divider"></div>
  <h2>CIERRE DE DÍA</h2>
  <p class="center fdo-company-line" style="margin:0 0 6px;font-size:14px">Resumen operativo (no fiscal)</p>
  <table>
    <tr class="header-row"><td><strong>Día operativo</strong></td><td style="text-align:right;font-weight:bold;font-size:14px">${escapeHtml(data.fechaOperacion)}</td></tr>
    ${cicloRows}
    ${generadoRows}
  </table>
  <div class="double-divider"></div>
  <table>
    <tr class="header-row"><td>Facturas pagadas</td><td style="text-align:right;font-weight:bold">${data.facturasPagadas}</td></tr>
    <tr class="header-row"><td>Facturas pendientes</td><td style="text-align:right">${data.facturasPendientes}</td></tr>
    <tr class="header-row"><td>Facturas canceladas</td><td style="text-align:right">${data.facturasCanceladas}</td></tr>
  </table>
  <div class="divider"></div>
  <table>
    <tr class="total-xl"><td>TOTAL COBRADO</td><td style="text-align:right">${rd(data.totalPagado, tenant)}</td></tr>
    <tr class="header-row"><td>Subtotal (pagadas)</td><td style="text-align:right">${rd(data.subtotalPagado, tenant)}</td></tr>
    <tr class="header-row"><td>ITBIS (pagadas)</td><td style="text-align:right">${rd(data.itbisPagado, tenant)}</td></tr>
    <tr class="header-row"><td>Ticket prom.</td><td style="text-align:right">${data.facturasPagadas > 0 ? rd(data.ticketPromedioPagado, tenant) : "—"}</td></tr>
  </table>
  ${
    data.cuentasAbiertasLineas != null &&
    data.cuentasAbiertasLineas > 0 &&
    data.cuentasAbiertasSubtotal != null
      ? `
  <div class="double-divider"></div>
  <p style="font-size:14px;font-weight:700;margin:0 0 4px">Cuentas abiertas (sin facturar)</p>
  <table>
    <tr class="header-row"><td>Líneas / mesas</td><td style="text-align:right;font-size:14px">${data.cuentasAbiertasLineas} / ${data.cuentasAbiertasMesas ?? "—"}</td></tr>
    <tr class="header-row"><td>Subtotal pendiente</td><td style="text-align:right;font-size:14px">${rd(data.cuentasAbiertasSubtotal, tenant)}</td></tr>
    <tr class="header-row"><td>ITBIS est. (18%)</td><td style="text-align:right;font-size:14px">${data.cuentasAbiertasItbisEst != null ? rd(data.cuentasAbiertasItbisEst, tenant) : "—"}</td></tr>
    <tr class="total"><td>TOTAL EST. PENDIENTE</td><td style="text-align:right">${data.cuentasAbiertasTotalEst != null ? rd(data.cuentasAbiertasTotalEst, tenant) : "—"}</td></tr>
  </table>
  <p class="center" style="font-size:13px;margin:4px 0 0;font-weight:600">No incluido en total cobrado — cobrar en POS</p>
  `
      : ""
  }
  <div class="double-divider"></div>
  <table>
    <thead class="fdo-items-head"><tr><th>Método</th><th class="c">#</th><th class="r">Total</th></tr></thead>
    <tbody>${metodoRows || `<tr><td colspan="3" class="center" style="font-size:14px;padding:6px 0;font-weight:600">Sin ventas pagadas</td></tr>`}</tbody>
  </table>
  <div class="double-divider"></div>
  <div class="footer">
    <p style="margin:0 0 4px">Conserve para control interno</p>
    <p style="margin:0;font-size:13px;font-weight:600">No constituye comprobante fiscal</p>
    <p style="margin:6px 0 0;font-size:13px;font-weight:600">CyberBistro OS — Cierre</p>
  </div>
  <div class="divider"></div>
  <div class="center" style="font-size:13px;font-weight:600">${escapeHtml(new Date().toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" }))}</div>
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cierre día</title><style>${thermalStyles(paperWidthMm)}</style></head><body>${body}</body></html>`;
}
