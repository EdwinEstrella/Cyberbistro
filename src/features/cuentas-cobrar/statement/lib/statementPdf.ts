import { jsPDF } from "jspdf";
import type { CompanyStatementData, StatementTenantInfo } from "../types";
import {
  buildEmployeeSummary,
  formatStatementDate,
  formatStatementMoney,
  formatStatementPeriod,
  getSantoDomingoToday,
} from "./statementFormat";

const PAGE_WIDTH = 210;
const MARGIN_LEFT = 14;
const MARGIN_RIGHT = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 182 mm
const TOP_MARGIN = 15;
const MAX_Y = 270; // Leave space for bottom margin & footer

export interface StatementPdfOptions {
  compress?: boolean;
  issueDate?: string; // YYYY-MM-DD
}

/**
 * Builds an A4 portrait statement PDF using jsPDF.
 */
export function buildStatementPdf(
  data: CompanyStatementData,
  tenant?: StatementTenantInfo | null,
  options?: StatementPdfOptions
): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: options?.compress ?? false,
  });

  const currency = tenant?.moneda || "DOP";
  const issueDateFormatted = formatStatementDate(
    options?.issueDate || getSantoDomingoToday()
  );

  let currentY = TOP_MARGIN;

  // 1. Header (Logo / Restaurant Info on Left, Title / Period on Right)
  const hasDataLogo = Boolean(
    tenant?.logo_url && tenant.logo_url.startsWith("data:image/")
  );

  if (hasDataLogo && tenant?.logo_url) {
    try {
      doc.addImage(tenant.logo_url, "PNG", MARGIN_LEFT, currentY, 22, 16);
    } catch {
      // Gracefully continue without logo if rendering fails
    }
  }

  const leftTextX = hasDataLogo ? MARGIN_LEFT + 25 : MARGIN_LEFT;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(24, 24, 27);
  doc.text(tenant?.nombre_negocio || "Restaurante", leftTextX, currentY + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);

  let leftY = currentY + 8;
  if (tenant?.rnc) {
    doc.text(`RNC: ${tenant.rnc}`, leftTextX, leftY);
    leftY += 3.8;
  }
  if (tenant?.telefono) {
    doc.text(`Tel: ${tenant.telefono}`, leftTextX, leftY);
    leftY += 3.8;
  }
  if (tenant?.direccion) {
    const splitAddress = doc.splitTextToSize(tenant.direccion, 65);
    doc.text(splitAddress, leftTextX, leftY);
    leftY += (Array.isArray(splitAddress) ? splitAddress.length : 1) * 3.8;
  }

  // Right Header: Title, Period, Issue Date
  const rightX = MARGIN_LEFT + CONTENT_WIDTH;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(24, 24, 27);
  doc.text("ESTADO DE CUENTA", rightX, currentY + 4, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    formatStatementPeriod(data.from, data.to),
    rightX,
    currentY + 10,
    { align: "right" }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.text(`Fecha de emisión: ${issueDateFormatted}`, rightX, currentY + 14.5, {
    align: "right",
  });

  currentY = Math.max(leftY, currentY + 19) + 4;

  // 2. Company Info Banner
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN_LEFT, currentY, CONTENT_WIDTH, 14, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("CLIENTE / EMPRESA", MARGIN_LEFT + 4, currentY + 4.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(data.customer.name || "Sin nombre", MARGIN_LEFT + 4, currentY + 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const docIdText = data.customer.document_id
    ? `RNC / Cédula: ${data.customer.document_id}`
    : "Sin RNC / Cédula";
  doc.text(docIdText, rightX - 4, currentY + 8.5, { align: "right" });

  currentY += 19;

  // 3. Orders Table
  const tableHeaderHeight = 7.5;
  const rowHeight = 6.5;

  const colX = {
    fecha: MARGIN_LEFT + 2,
    pedido: MARGIN_LEFT + 28,
    empleado: MARGIN_LEFT + 52,
    monto: MARGIN_LEFT + 128,
    pagado: MARGIN_LEFT + 155,
    pendiente: MARGIN_LEFT + 180,
  };

  const drawTableHeader = (y: number) => {
    doc.setFillColor(39, 39, 42);
    doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, tableHeaderHeight, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);

    doc.text("Fecha", colX.fecha, y + 5);
    doc.text("Pedido #", colX.pedido, y + 5);
    doc.text("Empleado", colX.empleado, y + 5);
    doc.text("Monto", colX.monto, y + 5, { align: "right" });
    doc.text("Pagado", colX.pagado, y + 5, { align: "right" });
    doc.text("Pendiente", colX.pendiente, y + 5, { align: "right" });
  };

  drawTableHeader(currentY);
  currentY += tableHeaderHeight;

  if (data.rows.length === 0) {
    doc.setFillColor(255, 255, 255);
    doc.rect(MARGIN_LEFT, currentY, CONTENT_WIDTH, 10, "F");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(113, 113, 122);
    doc.text(
      "No se registraron pedidos en el período seleccionado.",
      PAGE_WIDTH / 2,
      currentY + 6.5,
      { align: "center" }
    );
    currentY += 10;
  } else {
    data.rows.forEach((row, index) => {
      if (currentY + rowHeight > MAX_Y) {
        doc.addPage();
        currentY = TOP_MARGIN;
        drawTableHeader(currentY);
        currentY += tableHeaderHeight;
      }

      // Zebra striping
      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(MARGIN_LEFT, currentY, CONTENT_WIDTH, rowHeight, "F");
      }

      // Bottom row border
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(
        MARGIN_LEFT,
        currentY + rowHeight,
        MARGIN_LEFT + CONTENT_WIDTH,
        currentY + rowHeight
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(39, 39, 42);

      // Fecha
      doc.text(formatStatementDate(row.date), colX.fecha, currentY + 4.5);

      // Pedido #
      doc.text(`#${row.numero_pedido}`, colX.pedido, currentY + 4.5);

      // Empleado (truncated if needed to avoid overflow)
      const empName = row.employee_name?.trim() || "—";
      const maxEmpWidth = 46;
      let displayEmp = empName;
      if (doc.getTextWidth(displayEmp) > maxEmpWidth) {
        while (
          displayEmp.length > 3 &&
          doc.getTextWidth(`${displayEmp}...`) > maxEmpWidth
        ) {
          displayEmp = displayEmp.slice(0, -1);
        }
        displayEmp = `${displayEmp}...`;
      }
      doc.text(displayEmp, colX.empleado, currentY + 4.5);

      // Monto
      doc.text(
        formatStatementMoney(row.monto_total, currency),
        colX.monto,
        currentY + 4.5,
        { align: "right" }
      );

      // Pagado
      doc.text(
        formatStatementMoney(row.monto_pagado, currency),
        colX.pagado,
        currentY + 4.5,
        { align: "right" }
      );

      // Pendiente (monto_total - monto_pagado)
      const pendingRow = Number(row.monto_total || 0) - Number(row.monto_pagado || 0);
      doc.setFont(
        "helvetica",
        pendingRow > 0.009 ? "bold" : "normal"
      );
      if (pendingRow > 0.009) {
        doc.setTextColor(185, 28, 28);
      }
      doc.text(
        formatStatementMoney(pendingRow, currency),
        colX.pendiente,
        currentY + 4.5,
        { align: "right" }
      );

      currentY += rowHeight;
    });
  }

  currentY += 4;

  // 4. Resumen por Empleado (Grouping Summary below table)
  if (data.rows.length > 0) {
    const employeeSummary = buildEmployeeSummary(data.rows);
    const summaryHeaderHeight = 6;
    const summaryRowHeight = 5.5;

    // Check if employee summary header fits
    if (currentY + 20 > MAX_Y) {
      doc.addPage();
      currentY = TOP_MARGIN;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(24, 24, 27);
    doc.text("Resumen por empleado", MARGIN_LEFT, currentY + 4);
    currentY += 6;

    const empColX = {
      nombre: MARGIN_LEFT + 2,
      pedidos: MARGIN_LEFT + 120,
      total: MARGIN_LEFT + 180,
    };

    doc.setFillColor(241, 245, 249);
    doc.rect(MARGIN_LEFT, currentY, CONTENT_WIDTH, summaryHeaderHeight, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Empleado", empColX.nombre, currentY + 4.2);
    doc.text("Pedidos", empColX.pedidos, currentY + 4.2, { align: "right" });
    doc.text("Total", empColX.total, currentY + 4.2, { align: "right" });
    currentY += summaryHeaderHeight;

    employeeSummary.forEach((emp, index) => {
      if (currentY + summaryRowHeight > MAX_Y) {
        doc.addPage();
        currentY = TOP_MARGIN;
      }

      if (index % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(MARGIN_LEFT, currentY, CONTENT_WIDTH, summaryRowHeight, "F");
      }

      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(
        MARGIN_LEFT,
        currentY + summaryRowHeight,
        MARGIN_LEFT + CONTENT_WIDTH,
        currentY + summaryRowHeight
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(39, 39, 42);

      doc.text(emp.employeeName, empColX.nombre, currentY + 4);
      doc.text(String(emp.orderCount), empColX.pedidos, currentY + 4, {
        align: "right",
      });
      doc.setFont("helvetica", "bold");
      doc.text(
        formatStatementMoney(emp.totalAmount, currency),
        empColX.total,
        currentY + 4,
        { align: "right" }
      );

      currentY += summaryRowHeight;
    });

    currentY += 4;
  }

  // 5. Totals Block
  const totalsBlockHeight = 20;
  if (currentY + totalsBlockHeight > MAX_Y) {
    doc.addPage();
    currentY = TOP_MARGIN;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(
    MARGIN_LEFT,
    currentY,
    CONTENT_WIDTH,
    totalsBlockHeight,
    2,
    2,
    "FD"
  );

  const quadWidth = CONTENT_WIDTH / 4;

  // Box 1: Cantidad de pedidos
  const box1X = MARGIN_LEFT;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("CANTIDAD DE PEDIDOS", box1X + quadWidth / 2, currentY + 6.5, {
    align: "center",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(String(data.totals.count), box1X + quadWidth / 2, currentY + 14, {
    align: "center",
  });

  // Box 2: Total
  const box2X = MARGIN_LEFT + quadWidth;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL", box2X + quadWidth / 2, currentY + 6.5, {
    align: "center",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    formatStatementMoney(data.totals.total, currency),
    box2X + quadWidth / 2,
    currentY + 14,
    { align: "center" }
  );

  // Box 3: Pagado
  const box3X = MARGIN_LEFT + quadWidth * 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("PAGADO", box3X + quadWidth / 2, currentY + 6.5, {
    align: "center",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(22, 101, 52); // Dark green
  doc.text(
    formatStatementMoney(data.totals.paid, currency),
    box3X + quadWidth / 2,
    currentY + 14,
    { align: "center" }
  );

  // Box 4: Pendiente
  const box4X = MARGIN_LEFT + quadWidth * 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("PENDIENTE", box4X + quadWidth / 2, currentY + 6.5, {
    align: "center",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(185, 28, 28); // Red
  doc.text(
    formatStatementMoney(data.totals.pending, currency),
    box4X + quadWidth / 2,
    currentY + 14,
    { align: "center" }
  );

  // Divider lines inside totals block
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  for (let i = 1; i <= 3; i++) {
    const divX = MARGIN_LEFT + quadWidth * i;
    doc.line(divX, currentY + 3, divX, currentY + totalsBlockHeight - 3);
  }

  // 6. Footers ("Página X de Y" on every page)
  const totalPages = doc.getNumberOfPages();
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    doc.setPage(pageNum);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${pageNum} de ${totalPages}`, PAGE_WIDTH / 2, 287, {
      align: "center",
    });
  }

  return doc;
}
