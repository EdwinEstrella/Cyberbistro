import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ExportFormato607View } from "./ExportFormato607View";
import type { MonthOption } from "../../contabilidad/lib/formato607Export";
import type { ConsumoSummaryResult } from "../../contabilidad/lib/formato607";

describe("ExportFormato607View presentational component", () => {
  const dummyMonthOptions: MonthOption[] = [
    { value: "2026-08", label: "agosto de 2026" },
    { value: "2026-07", label: "julio de 2026" },
  ];

  const noop = () => {};

  const sampleSummary: ConsumoSummaryResult = {
    count: 5,
    totalMontoFacturado: 1500,
  };

  it("renders default export card with title, month picker, and action buttons", () => {
    const html = renderToStaticMarkup(
      <ExportFormato607View
        selectedMonth="2026-08"
        monthOptions={dummyMonthOptions}
        loading={false}
        errorMessage={null}
        successMessage={null}
        summary={null}
        onMonthChange={noop}
        onExport={noop}
      />
    );

    expect(html).toContain("Exportar Formato 607 (Ventas DGII)");
    expect(html).toContain("Envío mensual de ventas de bienes y servicios");
    expect(html).toContain("TXT");
    expect(html).toContain("Excel (CSV)");
  });

  it("disables export buttons while loading and displays spinner", () => {
    const html = renderToStaticMarkup(
      <ExportFormato607View
        selectedMonth="2026-08"
        monthOptions={dummyMonthOptions}
        loading={true}
        errorMessage={null}
        successMessage={null}
        summary={null}
        onMonthChange={noop}
        onExport={noop}
      />
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain("animate-spin");
  });

  it("renders success notification and consumo summary block when export completes", () => {
    const html = renderToStaticMarkup(
      <ExportFormato607View
        selectedMonth="2026-08"
        monthOptions={dummyMonthOptions}
        loading={false}
        errorMessage={null}
        successMessage="Formato 607 generado con 2 comprobante(s)."
        summary={sampleSummary}
        onMonthChange={noop}
        onExport={noop}
      />
    );

    expect(html).toContain("Formato 607 generado con 2 comprobante(s).");
    expect(html).toContain("Resumen General de Facturas de Consumo (&lt; RD$ 250,000):");
    expect(html).toContain('Cantidad: <strong class="text-foreground">5</strong> comprobante(s)');
    expect(html).toContain('Monto facturado: <strong class="text-foreground">RD$ 1,500.00</strong>');
    expect(html).toContain("Oficina Virtual");
  });

  it("shows Spanish error message and no success text when errorMessage is present", () => {
    const html = renderToStaticMarkup(
      <ExportFormato607View
        selectedMonth="2026-08"
        monthOptions={dummyMonthOptions}
        loading={false}
        errorMessage="No se pudieron cargar las facturas del período. Verificá tu conexión e intentá de nuevo."
        successMessage={null}
        summary={null}
        onMonthChange={noop}
        onExport={noop}
      />
    );

    expect(html).toContain("No se pudieron cargar las facturas del período. Verificá tu conexión e intentá de nuevo.");
    expect(html).not.toContain("Formato 607 generado con");
    expect(html).not.toContain("Resumen General de Facturas de Consumo");
  });
});
