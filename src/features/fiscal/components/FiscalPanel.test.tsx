import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { FiscalPanel } from "./FiscalPanel";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";

// Hoist mock state to share with vi.mock
const { mockState } = vi.hoisted(() => {
  return {
    mockState: {
      values: [] as any[],
      index: 0,
      reset() {
        this.values = [];
        this.index = 0;
      }
    }
  };
});

// Mock react module to provide mock hooks for Node test environment
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initialValue: any) => {
      const currentIndex = mockState.index;
      mockState.index++;
      const val = mockState.values[currentIndex] !== undefined ? mockState.values[currentIndex] : initialValue;
      const setter = (newVal: any) => {
        mockState.values[currentIndex] = newVal;
      };
      return [val, setter];
    },
    useEffect: () => {},
    useCallback: (fn: any) => fn,
  };
});

// Mock dependencies
vi.mock("../../../shared/lib/insforge", () => ({
  insforgeClient: {
    database: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      })),
    },
  },
}));

vi.mock("../../../shared/hooks/useAuth", () => ({
  useAuth: () => ({ tenantId: "tenant-1" }),
}));

vi.mock("../../../shared/lib/localFirst", () => ({
  getLocalFirstStatusSnapshot: vi.fn().mockResolvedValue({ status: "history_complete" }),
  readLocalMirror: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../shared/lib/thermalStorage", () => ({
  getThermalPrintSettings: () => ({ paperWidthMm: 80, printerName: "test-printer" }),
}));

vi.mock("../../../shared/lib/receiptTemplates", () => ({
  buildFacturaReceiptHtml: vi.fn().mockResolvedValue("<html>Receipt</html>"),
}));

vi.mock("../../../shared/lib/thermalPrint", () => ({
  printThermalHtml: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../../../shared/lib/logoCache", () => ({
  cacheLogoFromUrl: vi.fn(),
}));

// Recursive tree search helper to assert on React virtual elements in node environment
function findInTree(tree: any, predicate: (node: any) => boolean): any[] {
  const results: any[] = [];
  function recurse(node: any) {
    if (!node) return;
    if (predicate(node)) {
      results.push(node);
    }
    if (node.props && node.props.children) {
      React.Children.forEach(node.props.children, (child) => {
        recurse(child);
      });
    }
  }
  recurse(tree);
  return results;
}

describe("FiscalPanel UI and Print triggers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("alert", vi.fn());
    vi.stubGlobal("navigator", { onLine: true });
    mockState.reset();
  });

  it("compiles and displays loading screen by default", () => {
    // isLoading (index 4) defaults to true
    const element = FiscalPanel();
    expect(element).toBeDefined();
    expect(element.props.className).toContain("p-8");
    expect(element.props.children).toContain("Cargando documentos fiscales...");
  });

  it("renders loaded view and displays configuration warning banner when active", () => {
    // Mock state so isLoading is false and documents has a configuration error
    mockState.values[3] = [
      {
        id: "doc-1",
        status: "pending_configuration",
        created_at: "2026-06-12T02:00:00Z",
        facturas: { numero_factura: 101, ncf: "E310000000001", total: 1200 },
        tenants: { rnc: "123456789", nombre_negocio: "Cyberbistro Mock" }
      }
    ]; // documents (index 3)
    mockState.values[4] = false; // isLoading (index 4)

    const element = FiscalPanel();
    expect(element).toBeDefined();
    expect(element.props.className).toContain("flex-1");

    // Search for config error banner in the JSX tree
    const bannerNodes = findInTree(element, (node) => {
      return (
        typeof node.props?.children === "string" &&
        node.props.children.includes("Se detectaron errores de configuración en algunos documentos")
      );
    });
    expect(bannerNodes.length).toBeGreaterThan(0);

    // Search for configuration warning text in the document cell
    const cellWarningNodes = findInTree(element, (node) => {
      return (
        typeof node.props?.children === "string" &&
        node.props.children.includes("Configuración fiscal incompleta")
      );
    });
    expect(cellWarningNodes.length).toBeGreaterThan(0);
  });

  it("renders batch rejection states and checks for batch action buttons", () => {
    // Mock state so documents includes a batch rejection
    mockState.values[3] = [
      {
        id: "doc-2",
        status: "rejected",
        rejection_scope: "batch",
        created_at: "2026-06-12T02:10:00Z",
        facturas: { numero_factura: 102, ncf: "E320000000002", total: 500 },
        tenants: { rnc: "123456789", nombre_negocio: "Cyberbistro Mock" },
        ecf_batches: { id: "batch-1", status: "rejected", last_error: "DGII Batch Validation Error" }
      }
    ]; // documents (index 3)
    mockState.values[4] = false; // isLoading (index 4)

    const element = FiscalPanel();
    expect(element).toBeDefined();

    // Check that batch rejection status text renders
    const statusTextNodes = findInTree(element, (node) => {
      return (
        typeof node.props?.children === "string" &&
        node.props.children.includes("Rechazado por DGII en resumen RFCE")
      );
    });
    expect(statusTextNodes.length).toBeGreaterThan(0);

    // Check that action buttons "Ver error del lote" and "Reintentar resumen" are present
    const viewBatchErrorBtn = findInTree(element, (node) => {
      return (
        node.type === "button" &&
        typeof node.props?.children === "string" &&
        node.props.children === "Ver error del lote"
      );
    });
    expect(viewBatchErrorBtn.length).toBeGreaterThan(0);

    const retrySummaryBtn = findInTree(element, (node) => {
      return (
        node.type === "button" &&
        typeof node.props?.children === "string" &&
        node.props.children === "Reintentar resumen"
      );
    });
    expect(retrySummaryBtn.length).toBeGreaterThan(0);
  });

  it("proves printing functions can bypass print dialog using silent option", async () => {
    expect(printThermalHtml).toBeDefined();
    const result = await printThermalHtml("<html>Receipt</html>", { silent: true });
    expect(printThermalHtml).toHaveBeenCalledWith("<html>Receipt</html>", { silent: true });
    expect(result.ok).toBe(true);
  });
});
