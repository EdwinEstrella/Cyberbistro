import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TableMesaCard } from "./TableMesaCard";

vi.mock("../../../shared/context/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));

describe("TableMesaCard", () => {
  const baseMesa = {
    id: 1,
    numero: 5,
    capacidad: 4,
    estado: "libre" as const,
    fusionada: false,
    fusion_padre_id: null,
    fila: 1,
    columna: 1,
    span_filas: 1,
    span_columnas: 1,
    fusion_hijos: [],
  };

  it("renders mesa without alert indicator by default", () => {
    const html = renderToStaticMarkup(
      <TableMesaCard
        mesa={baseMesa}
        isSelected={false}
        isMergeTarget={false}
        deudaTotal={0}
        onClick={vi.fn()}
        formatCurrency={(n) => `$${n}`}
      />
    );

    expect(html).toContain("05");
    expect(html).not.toContain('data-testid="table-alert-indicator-5"');
  });

  it("renders alert indicator when hasPendingAlert is true", () => {
    const html = renderToStaticMarkup(
      <TableMesaCard
        mesa={baseMesa}
        isSelected={false}
        isMergeTarget={false}
        deudaTotal={0}
        onClick={vi.fn()}
        formatCurrency={(n) => `$${n}`}
        hasPendingAlert={true}
      />
    );

    expect(html).toContain('data-testid="table-alert-indicator-5"');
    expect(html).toContain("Solicitud pendiente en mesa");
  });
});
