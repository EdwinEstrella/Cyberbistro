import type { PaperWidthMm } from "./thermalStorage";

export interface TenantReceiptInfo {
  nombre_negocio: string | null;
  rnc: string | null;
  direccion: string | null;
  telefono: string | null;
  logo_url: string | null;
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
    body {
      font-family: 'Courier New', Consolas, monospace;
      font-size: 11px;
      width: ${bodyMax};
      max-width: ${bodyMax};
      margin: 0 auto;
      padding: 2mm;
      color: #000;
      background: #fff;
    }
    h1 { text-align: center; font-size: 14px; margin: 0 0 4px; font-weight: bold; }
    h2 { text-align: center; font-size: 12px; margin: 0 0 6px; font-weight: bold; letter-spacing: 0.5px; }
    .center { text-align: center; }
    .divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    .double-divider { border: none; border-top: 3px double #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    .header-row td { padding: 2px 0; font-size: 10px; }
    .total { font-weight: bold; font-size: 12px; }
    .footer { text-align: center; font-size: 9px; margin-top: 6px; }
    .logo-wrap { text-align: center; margin-bottom: 6px; }
    .logo-wrap img { max-width: 100%; max-height: 56px; object-fit: contain; }
    .item-row td { padding: 3px 0; vertical-align: top; }
  `;
}

function headerBlock(t: TenantReceiptInfo): string {
  const nombre = escapeHtml(t.nombre_negocio || "CyberBistro");
  const logo = t.logo_url
    ? `<div class="logo-wrap"><img src="${escapeHtml(t.logo_url)}" alt="" crossorigin="anonymous" /></div>`
    : "";
  const rnc = t.rnc ? `<div class="center" style="font-size:10px;">RNC: ${escapeHtml(t.rnc)}</div>` : "";
  const dir = t.direccion ? `<div class="center" style="font-size:9px;">${escapeHtml(t.direccion)}</div>` : "";
  const tel = t.telefono ? `<div class="center" style="font-size:9px;">Tel: ${escapeHtml(t.telefono)}</div>` : "";
  return `${logo}<h1>${nombre}</h1>${rnc}${dir}${tel}`;
}

export function buildFacturaReceiptHtml(
  tenant: TenantReceiptInfo,
  factura: {
    items: Array<{ cantidad: number; nombre: string; precio_unitario?: number; subtotal?: number }>;
    subtotal: number;
    itbis: number;
    total: number;
    metodo_pago: string;
    mesa_numero: number | null;
    notas: string | null;
    pagada_at?: string | null;
    created_at?: string;
  },
  numeroFactura: number,
  paperWidthMm: PaperWidthMm
): string {
  const fecha = new Date(factura.pagada_at || factura.created_at || Date.now()).toLocaleString("es-DO");
  const mesaLabel = factura.mesa_numero != null ? String(factura.mesa_numero) : "Para llevar";

  const itemsRows = factura.items
    .map(
      (item) => `
    <tr class="item-row">
      <td style="width:12%">${item.cantidad}</td>
      <td style="width:53%">${escapeHtml(item.nombre)}</td>
      <td style="width:35%;text-align:right">RD$ ${Number(item.subtotal ?? item.cantidad * Number(item.precio_unitario ?? 0)).toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const body = `
  ${headerBlock(tenant)}
  <div class="divider"></div>
  <h2>FACTURA DE VENTA</h2>
  <table>
    <tr class="header-row"><td>Factura N°</td><td style="text-align:right">#${String(numeroFactura).padStart(6, "0")}</td></tr>
    <tr class="header-row"><td>Fecha</td><td style="text-align:right">${escapeHtml(fecha)}</td></tr>
    <tr class="header-row"><td>Mesa</td><td style="text-align:right">${escapeHtml(mesaLabel)}</td></tr>
    <tr class="header-row"><td>Método</td><td style="text-align:right">${escapeHtml(factura.metodo_pago.toUpperCase())}</td></tr>
  </table>
  <div class="double-divider"></div>
  <table>
    <thead><tr style="border-bottom:1px solid #000;font-size:10px;"><th style="text-align:left;padding:4px 0">CANT</th><th style="text-align:left">DESCRIP.</th><th style="text-align:right">IMPORTE</th></tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>
  <div class="double-divider"></div>
  <table>
    <tr><td>Subtotal</td><td style="text-align:right">RD$ ${Number(factura.subtotal).toFixed(2)}</td></tr>
    <tr><td>ITBIS (18%)</td><td style="text-align:right">RD$ ${Number(factura.itbis).toFixed(2)}</td></tr>
    <tr class="total"><td>TOTAL</td><td style="text-align:right">RD$ ${Number(factura.total).toFixed(2)}</td></tr>
  </table>
  ${factura.notas ? `<div class="divider"></div><div style="font-size:10px"><b>Nota:</b> ${escapeHtml(factura.notas)}</div>` : ""}
  <div class="double-divider"></div>
  <div class="footer">
    <div>¡Gracias por su visita!</div>
    <div style="margin-top:4px">Documento no fiscal valor informativo</div>
  </div>
  <div class="divider"></div>
  <div class="center" style="font-size:8px">${escapeHtml(new Date().toLocaleString("es-DO"))}</div>
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Factura</title><style>${thermalStyles(paperWidthMm)}</style></head><body>${body}</body></html>`;
}

export function buildComandaReceiptHtml(
  tenant: TenantReceiptInfo,
  comanda: {
    id: string;
    numero_comanda?: number | null;
    mesa_numero: number | null;
    items: Array<{ nombre: string; cantidad: number; precio?: number }>;
    notas?: string | null;
    created_at?: string | null;
  },
  paperWidthMm: PaperWidthMm
): string {
  const fecha = new Date(comanda.created_at || Date.now()).toLocaleString("es-DO");
  const num = comanda.numero_comanda != null ? String(comanda.numero_comanda) : comanda.id.slice(0, 8).toUpperCase();

  const rows = comanda.items
    .map(
      (it) => `
    <tr class="item-row">
      <td style="font-weight:bold;font-size:13px;width:18%">${it.cantidad}×</td>
      <td style="font-size:12px">${escapeHtml(it.nombre)}</td>
    </tr>`
    )
    .join("");

  const body = `
  ${headerBlock(tenant)}
  <div class="divider"></div>
  <h2>COMANDA — COCINA</h2>
  <table>
    <tr class="header-row"><td>Comanda</td><td style="text-align:right">#${escapeHtml(num)}</td></tr>
    <tr class="header-row"><td>Fecha</td><td style="text-align:right">${escapeHtml(fecha)}</td></tr>
    <tr class="header-row"><td>Mesa</td><td style="text-align:right">${comanda.mesa_numero != null ? escapeHtml(String(comanda.mesa_numero)) : "—"}</td></tr>
  </table>
  <div class="double-divider"></div>
  <table><tbody>${rows}</tbody></table>
  ${comanda.notas ? `<div class="divider"></div><div style="font-size:10px"><b>Nota cocina:</b> ${escapeHtml(comanda.notas)}</div>` : ""}
  <div class="double-divider"></div>
  <div class="footer">Preparar en orden — CyberBistro OS</div>
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comanda</title><style>${thermalStyles(paperWidthMm)}</style></head><body>${body}</body></html>`;
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
  <div class="center" style="font-size:11px;margin-bottom:6px">${escapeHtml(mesa)}</div>
  <div class="center" style="font-size:11px;font-weight:bold">Persona ${opts.personIndex} de ${opts.splitParts}</div>
  <div class="divider"></div>
  <table>${opts.rowsHtml}</table>
  <div class="divider"></div>
  <table style="width:100%"><tr class="total"><td>TOTAL</td><td style="text-align:right">${opts.totalLine}</td></tr></table>
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
