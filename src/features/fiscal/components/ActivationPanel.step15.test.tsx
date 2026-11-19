import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

// Hoisted mock state to intercept React hooks for ActivationPanel in Node test environment
const { hookState } = vi.hoisted(() => {
  return {
    hookState: {
      values: [] as any[],
      effects: [] as Array<() => void | (() => void)>,
      index: 0,
      effectIndex: 0,
      reset() {
        this.values = [];
        this.effects = [];
        this.index = 0;
        this.effectIndex = 0;
      },
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initialValue: any) => {
      const currentIndex = hookState.index++;
      if (hookState.values[currentIndex] === undefined) {
        hookState.values[currentIndex] = typeof initialValue === "function" ? initialValue() : initialValue;
      }
      const val = hookState.values[currentIndex];
      const setter = (newVal: any) => {
        hookState.values[currentIndex] =
          typeof newVal === "function" ? newVal(hookState.values[currentIndex]) : newVal;
      };
      return [val, setter];
    },
    useEffect: (effect: () => void | (() => void)) => {
      hookState.effects.push(effect);
    },
    useCallback: (fn: any) => fn,
  };
});

// Mock Supabase
const { mockUpsert, mockSelectProgress, mockSelectTenant } = vi.hoisted(() => ({
  mockUpsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  mockSelectProgress: vi.fn(),
  mockSelectTenant: vi.fn(),
}));

vi.mock("../../../shared/lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "ecf_certification_progress") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: () => mockSelectProgress(),
            })),
          })),
          upsert: (...args: any[]) => mockUpsert(...args),
        };
      }
      if (table === "tenants") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: () => mockSelectTenant(),
            })),
          })),
        };
      }
      // default mock for other tables like ecf_certificate_metadata, etc.
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                })),
              })),
            })),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        })),
      };
    }),
  },
}));

vi.mock("../../../shared/hooks/useAuth", () => ({
  useAuth: () => ({
    tenantId: "tenant-step15-test",
    plan: "pro",
    user: { id: "user-test-15" },
  }),
}));

vi.mock("../../../shared/lib/localFirst", () => ({
  enqueueLocalWrite: vi.fn().mockResolvedValue(undefined),
  getDeviceId: vi.fn().mockResolvedValue("test-device-id"),
}));

// Mock heavy subcomponents
vi.mock("./DocumentSigner", () => ({
  DocumentSigner: () => <div data-testid="document-signer" />,
}));
vi.mock("./TestSetRunner", () => ({
  TestSetRunner: () => <div data-testid="test-set-runner" />,
}));
vi.mock("./PrintedRepresentationRunner", () => ({
  PrintedRepresentationRunner: () => <div data-testid="printed-rep-runner" />,
}));
vi.mock("./ReceivedEvidencePanel", () => ({
  ReceivedEvidencePanel: () => <div data-testid="received-evidence-panel" />,
  approvalRows: () => [],
  documentRows: () => [],
}));
vi.mock("./ReceptorUrlFields", () => ({
  ReceptorUrlFields: () => <div data-testid="receptor-url-fields" />,
}));
vi.mock("./EcfTestSendCard", () => ({
  EcfTestSendCard: () => <div data-testid="ecf-test-send-card" />,
}));
vi.mock("../../ajustes/components/CertificateUploader", () => ({
  CertificateUploader: () => <div data-testid="certificate-uploader" />,
}));

import { ActivationPanel } from "./ActivationPanel";

// Tree walking helpers
function findInTree(tree: any, predicate: (node: any) => boolean): any[] {
  const results: any[] = [];
  function recurse(node: any) {
    if (!node) return;
    if (predicate(node)) {
      results.push(node);
    }
    if (typeof node.type === "function") {
      try {
        const rendered = node.type(node.props);
        recurse(rendered);
      } catch {
        // ignore if not callable directly
      }
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

function getNodeText(node: any): string {
  let text = "";
  function walk(n: any) {
    if (n == null || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") {
      text += String(n);
      return;
    }
    if (n.props?.children) {
      React.Children.forEach(n.props.children, walk);
    }
  }
  walk(node);
  return text.trim();
}

describe("ActivationPanel Step 15 confirmation and routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookState.reset();
    mockSelectTenant.mockResolvedValue({
      data: {
        nombre_negocio: "Test Bistro",
        rnc: "101010101",
        telefono: "8095551234",
        email: "test@bistro.com",
        direccion: "Calle Principal",
        ecf_environment: "certification",
        fiscal_mode: "ncf_legacy",
      },
      error: null,
    });
    mockSelectProgress.mockResolvedValue({
      data: { current_step: 1, completed_steps: [] },
      error: null,
    });
  });

  function renderPanel() {
    hookState.index = 0;
    hookState.effectIndex = 0;
    return ActivationPanel({ onNavigateToGeneral: () => {} });
  }

  async function triggerEffects() {
    const list = [...hookState.effects];
    hookState.effects = [];
    for (const effect of list) {
      effect();
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  it("renders step 15 button enabled with 'Confirmar certificación completada — Continuar'", () => {
    // State layout in ActivationPanel:
    // hookState.values[0] = step (WIZARD_STEP.certification = 2)
    // hookState.values[11] = certificationStep (15)
    // hookState.values[12] = completedCertificationSteps ([1..14])
    hookState.values[0] = 2; // WIZARD_STEP.certification
    hookState.values[11] = 15; // Step 15
    hookState.values[12] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

    const tree = renderPanel();

    // Verify CertificationComplete component is visible
    const checklistHeader = findInTree(
      tree,
      (n) => n.props?.children === "Checklist de certificación revisado"
    );
    expect(checklistHeader.length).toBeGreaterThan(0);

    // Verify confirmation button is rendered, enabled, with the exact required label
    const buttons = findInTree(tree, (n) => n.type === "button");
    const confirmButton = buttons.find((btn) =>
      getNodeText(btn).includes("Confirmar certificación completada — Continuar")
    );

    expect(confirmButton).toBeDefined();
    expect(confirmButton.props.disabled).toBe(false);
    expect(getNodeText(confirmButton)).toBe("Confirmar certificación completada — Continuar");
  });

  it("clicking step 15 button persists completion and moves wizard to environment stage", async () => {
    hookState.values[0] = 2; // WIZARD_STEP.certification
    hookState.values[11] = 15; // Step 15
    hookState.values[12] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

    const tree = renderPanel();
    const buttons = findInTree(tree, (n) => n.type === "button");
    const confirmButton = buttons.find((btn) =>
      getNodeText(btn).includes("Confirmar certificación completada — Continuar")
    );

    expect(confirmButton).toBeDefined();

    // Click the button
    confirmButton.props.onClick();

    // Verify persistCertificationProgress was called with step 15 in completed_steps
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-step15-test",
        current_step: 15,
        completed_steps: expect.arrayContaining([15]),
      }),
      { onConflict: "tenant_id" }
    );

    // Verify wizard step transitioned to WIZARD_STEP.environment (3)
    expect(hookState.values[0]).toBe(3); // WIZARD_STEP.environment

    // Re-render and check that the environment stage is rendered
    const nextTree = renderPanel();
    const envHeader = findInTree(
      nextTree,
      (n) => n.props?.children === "Ambiente de la DGII"
    );
    expect(envHeader.length).toBeGreaterThan(0);
  });

  it("opens past certification to environment when certification is already completed on load", async () => {
    // Supabase returns progress with step 15 already completed
    mockSelectProgress.mockResolvedValue({
      data: {
        current_step: 15,
        completed_steps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      },
      error: null,
    });

    // Initial mount: wizard starts on step 1 (company)
    renderPanel();
    expect(hookState.values[0]).toBe(1); // Initially WIZARD_STEP.company

    // Trigger cloud load effects
    await triggerEffects();

    // After loading completed certification progress, wizard step must lead to environment (3)
    expect(hookState.values[0]).toBe(3); // WIZARD_STEP.environment

    // Re-render and verify the environment stage is shown
    const loadedTree = renderPanel();
    const envHeader = findInTree(
      loadedTree,
      (n) => n.props?.children === "Ambiente de la DGII"
    );
    expect(envHeader.length).toBeGreaterThan(0);
  });

  it("does not trap the user when reopening certification section after completion", () => {
    // User whose certification is already completed navigates back to certification tab
    hookState.values[0] = 2; // WIZARD_STEP.certification
    hookState.values[11] = 15;
    hookState.values[12] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

    const tree = renderPanel();

    // Displays completion state
    const checklistHeader = findInTree(
      tree,
      (n) => n.props?.children === "Checklist de certificación revisado"
    );
    expect(checklistHeader.length).toBeGreaterThan(0);

    // Button is enabled and allows continuing to environment
    const buttons = findInTree(tree, (n) => n.type === "button");
    const confirmButton = buttons.find((btn) =>
      getNodeText(btn).includes("Confirmar certificación completada — Continuar")
    );
    expect(confirmButton).toBeDefined();
    expect(confirmButton.props.disabled).toBe(false);

    // Clicking it moves to environment
    confirmButton.props.onClick();
    expect(hookState.values[0]).toBe(3); // WIZARD_STEP.environment
  });
});
