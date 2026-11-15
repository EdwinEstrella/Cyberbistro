import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabase = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq2 = vi.fn((_col?: string, _val?: unknown) => ({ maybeSingle }));
  const eq1 = vi.fn((_col?: string, _val?: unknown) => ({ eq: eq2 }));
  const select = vi.fn((_columns?: string) => ({ eq: eq1 }));
  const from = vi.fn((_table?: string) => ({ select }));
  return {
    from,
    select,
    eq1,
    eq2,
    maybeSingle,
    client: { from },
  };
});

vi.mock("./supabase", () => ({
  supabase: mockSupabase.client,
}));

import {
  gateFiscalPrint,
  isEcfInvoiceDocument,
  extractSecurityCode,
  defaultCheckCloud,
  clearFiscalPrintQueue,
  DEFAULT_POLL_DELAYS,
  getFiscalPrintBackgroundQueue,
  runBackgroundRetryOnce,
  FISCAL_GATE_WAITING_MESSAGE,
  FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE,
  type EcfDocumentState,
  type FiscalPrintGateDependencies,
} from "./fiscalPrintGate";

describe("fiscalPrintGate", () => {
  let mockPrintReceipt: ReturnType<typeof vi.fn>;
  let mockCheckLocal: ReturnType<typeof vi.fn>;
  let mockCheckCloud: ReturnType<typeof vi.fn>;
  let mockTriggerSync: ReturnType<typeof vi.fn>;
  let mockShowWaitingNotice: ReturnType<typeof vi.fn>;
  let mockDismissWaiting: ReturnType<typeof vi.fn>;
  let mockShowMessage: ReturnType<typeof vi.fn>;
  let isOnlineValue: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    clearFiscalPrintQueue();
    isOnlineValue = true;
    mockDismissWaiting = vi.fn();
    mockShowWaitingNotice = vi.fn(() => mockDismissWaiting);
    mockShowMessage = vi.fn();
    mockPrintReceipt = vi.fn(async () => ({ ok: true }));
    mockCheckLocal = vi.fn(async () => null);
    mockCheckCloud = vi.fn(async () => null);
    mockTriggerSync = vi.fn(async () => undefined);
  });

  function createTestDeps(overrides: Partial<FiscalPrintGateDependencies> = {}): FiscalPrintGateDependencies {
    return {
      isEcf: isEcfInvoiceDocument,
      checkLocalMirror: mockCheckLocal,
      checkCloud: mockCheckCloud,
      triggerSync: mockTriggerSync,
      printReceipt: mockPrintReceipt,
      showWaitingNotice: mockShowWaitingNotice,
      showMessage: mockShowMessage,
      isOnline: () => isOnlineValue,
      sleep: vi.fn(async () => undefined),
      pollDelays: [10, 20],
      ...overrides,
    };
  }

  it("non e-CF passthrough: prints immediately without checking DGII or waiting", async () => {
    const deps = createTestDeps();
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-b02", ncf: "B0200000001", total: 100 },
        numeroFactura: 1,
      },
      deps
    );

    expect(result.printed).toBe(true);
    expect(result.reason).toBe("not_ecf");
    expect(mockPrintReceipt).toHaveBeenCalledTimes(1);
    expect(mockShowWaitingNotice).not.toHaveBeenCalled();
    expect(mockCheckLocal).not.toHaveBeenCalled();
    expect(mockCheckCloud).not.toHaveBeenCalled();
  });

  it("prints immediately when code present in local mirror or document", async () => {
    mockCheckLocal.mockResolvedValueOnce({
      status: "accepted",
      dgii_security_code: "SEC-999",
      dgii_status: "accepted",
    } satisfies EcfDocumentState);

    const deps = createTestDeps();
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-ecf-1", ncf: "E310000000001", total: 500 },
        numeroFactura: 10,
      },
      deps
    );

    expect(result.printed).toBe(true);
    expect(result.reason).toBe("already_ready");
    expect(mockPrintReceipt).toHaveBeenCalledTimes(1);
    expect(mockPrintReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        ecfDocument: expect.objectContaining({ dgii_security_code: "SEC-999" }),
      })
    );
    expect(mockShowWaitingNotice).not.toHaveBeenCalled();
  });

  it("waits then prints when code appears after polling", async () => {
    // 1st check: no code; 2nd check: code arrives in local mirror
    mockCheckLocal
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: "accepted",
        dgii_security_code: "SEC-ARRIVED",
        dgii_status: "accepted",
      } satisfies EcfDocumentState);

    const deps = createTestDeps();
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-ecf-2", ncf: "E320000000002", total: 600 },
        numeroFactura: 11,
      },
      deps
    );

    expect(mockShowWaitingNotice).toHaveBeenCalledWith(FISCAL_GATE_WAITING_MESSAGE);
    expect(mockDismissWaiting).toHaveBeenCalledTimes(1);
    expect(mockPrintReceipt).toHaveBeenCalledTimes(1);
    expect(mockPrintReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        ecfDocument: expect.objectContaining({ dgii_security_code: "SEC-ARRIVED" }),
      })
    );
    expect(result.printed).toBe(true);
    expect(result.reason).toBe("code_arrived");
  });

  it("waits about 30 seconds in the foreground before handing over to the background queue", () => {
    expect(DEFAULT_POLL_DELAYS.reduce((total, delay) => total + delay, 0)).toBe(30000);
  });

  it("does not print a signed-but-unaccepted e-CF: keeps waiting until DGII accepts it", async () => {
    const signedPending = { status: "pending", dgii_status: "pending", dgii_security_code: "SEC-LOCAL" } satisfies EcfDocumentState;
    mockCheckLocal
      .mockResolvedValueOnce(signedPending) // initial check
      .mockResolvedValueOnce(signedPending) // 1st poll: code exists but DGII has not answered
      .mockResolvedValueOnce({ ...signedPending, status: "accepted", dgii_status: "accepted" }); // 2nd poll

    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-ecf-wait", ncf: "E320000000010", total: 413 },
        numeroFactura: 20,
      },
      createTestDeps()
    );

    expect(mockShowWaitingNotice).toHaveBeenCalledWith(FISCAL_GATE_WAITING_MESSAGE);
    expect(mockPrintReceipt).toHaveBeenCalledTimes(1);
    expect(mockCheckLocal).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ printed: true, reason: "code_arrived" });
  });

  it("does not print immediately when the request only carries a local security code", async () => {
    mockCheckCloud.mockResolvedValue({ status: "accepted", dgii_security_code: "SEC-OK" } satisfies EcfDocumentState);

    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-ecf-code-only", ncf: "E320000000011", total: 413, ecf_security_code: "SEC-LOCAL" },
        numeroFactura: 21,
        ecfDocument: { status: "pending", dgii_security_code: "SEC-LOCAL" },
      },
      createTestDeps()
    );

    expect(mockShowWaitingNotice).toHaveBeenCalledWith(FISCAL_GATE_WAITING_MESSAGE);
    expect(result.reason).toBe("code_arrived");
    expect(mockPrintReceipt).toHaveBeenCalledTimes(1);
  });

  it("prints an accepted_conditional e-CF (DGII accepted it with observations)", async () => {
    mockCheckLocal.mockResolvedValueOnce({
      status: "accepted_conditional",
      dgii_security_code: "SEC-COND",
    } satisfies EcfDocumentState);

    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-ecf-cond", ncf: "E320000000012", total: 413 },
        numeroFactura: 22,
      },
      createTestDeps()
    );

    expect(result).toMatchObject({ printed: true, reason: "already_ready" });
    expect(mockShowWaitingNotice).not.toHaveBeenCalled();
  });

  it("never prints on rejected: dismisses notice and shows rejection message", async () => {
    mockCheckLocal
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: "rejected",
        dgii_status: "rejected",
        dgii_status_message: "RNC del comprador no es válido",
      } satisfies EcfDocumentState);

    const deps = createTestDeps();
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-ecf-3", ncf: "E310000000003", total: 700 },
        numeroFactura: 12,
      },
      deps
    );

    expect(mockShowWaitingNotice).toHaveBeenCalledWith(FISCAL_GATE_WAITING_MESSAGE);
    expect(mockDismissWaiting).toHaveBeenCalledTimes(1);
    expect(mockPrintReceipt).not.toHaveBeenCalled();
    expect(mockShowMessage).toHaveBeenCalledWith("RNC del comprador no es válido", "error");
    expect(result.printed).toBe(false);
    expect(result.reason).toBe("rejected");
  });

  it("treats terminal_error from the polled mirror as a rejection (never prints)", async () => {
    mockCheckLocal.mockResolvedValueOnce(null).mockResolvedValueOnce({
      status: "terminal_error",
      dgii_status: "terminal_error",
      dgii_status_message: "DGII [2] Rechazado: El RNC Emisor no tiene una postulación activa.",
    } satisfies EcfDocumentState);

    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-ecf-te", ncf: "E320000000001", total: 413 },
        numeroFactura: 8719,
      },
      createTestDeps()
    );

    expect(mockPrintReceipt).not.toHaveBeenCalled();
    expect(mockShowMessage).toHaveBeenCalledWith(
      "DGII [2] Rechazado: El RNC Emisor no tiene una postulación activa.",
      "error"
    );
    expect(result).toMatchObject({ printed: false, reason: "rejected" });
  });

  it("does not print a rejected document that already carries the locally computed security code", async () => {
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-ecf-sc", ncf: "E320000000001", total: 413, fiscal_status: "terminal_error" },
        numeroFactura: 8719,
        ecfDocument: {
          status: "terminal_error",
          dgii_security_code: "bimE5u",
          dgii_status_message: "DGII [2] Rechazado: El RNC Emisor no tiene una postulación activa.",
        },
      },
      createTestDeps()
    );

    expect(mockPrintReceipt).not.toHaveBeenCalled();
    expect(mockShowMessage).toHaveBeenCalledWith(
      "DGII [2] Rechazado: El RNC Emisor no tiene una postulación activa.",
      "error"
    );
    expect(result).toMatchObject({ printed: false, reason: "rejected" });
  });

  it("timeout -> no print + shows Spanish message and enqueues background retry", async () => {
    // Both poll attempts return no code
    mockCheckLocal.mockResolvedValue(null);
    mockCheckCloud.mockResolvedValue(null);

    const deps = createTestDeps();
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-ecf-timeout", ncf: "E310000000004", total: 800 },
        numeroFactura: 13,
      },
      deps
    );

    expect(mockShowWaitingNotice).toHaveBeenCalledWith(FISCAL_GATE_WAITING_MESSAGE);
    expect(mockDismissWaiting).toHaveBeenCalledTimes(1);
    expect(mockPrintReceipt).not.toHaveBeenCalled();
    expect(mockShowMessage).toHaveBeenCalledWith(FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE, "info");
    expect(result.printed).toBe(false);
    expect(result.reason).toBe("timeout");
    expect(result.queuedForBackground).toBe(true);

    const queue = getFiscalPrintBackgroundQueue();
    expect(queue.has("inv-ecf-timeout")).toBe(true);
  });

  it("no duplicate jobs for the same factura", async () => {
    let resolveFirstCheck: (val: any) => void = () => {};
    const hangingPromise = new Promise((resolve) => {
      resolveFirstCheck = resolve;
    });

    mockCheckLocal.mockImplementationOnce(() => hangingPromise);

    const deps = createTestDeps();
    const firstPromise = gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-dup", ncf: "E310000000005", total: 900 },
        numeroFactura: 14,
      },
      deps
    );

    // Immediate second call for the same factura ID while the first is pending
    const secondResult = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-dup", ncf: "E310000000005", total: 900 },
        numeroFactura: 14,
      },
      deps
    );

    expect(secondResult.reason).toBe("duplicate");
    expect(secondResult.printed).toBe(false);

    // Unblock first
    resolveFirstCheck({ dgii_security_code: "CODE-DUP", status: "accepted" });
    const firstResult = await firstPromise;
    expect(firstResult.printed).toBe(true);
  });

  it("offline: does not wait or poll, shows message, and enqueues background retry", async () => {
    isOnlineValue = false;
    const deps = createTestDeps();
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-offline", ncf: "E310000000006", total: 1000 },
        numeroFactura: 15,
      },
      deps
    );

    expect(mockShowWaitingNotice).not.toHaveBeenCalled();
    expect(mockPrintReceipt).not.toHaveBeenCalled();
    expect(mockShowMessage).toHaveBeenCalledWith(FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE, "info");
    expect(result.printed).toBe(false);
    expect(result.reason).toBe("offline");
    expect(result.queuedForBackground).toBe(true);

    const queue = getFiscalPrintBackgroundQueue();
    expect(queue.has("inv-offline")).toBe(true);
  });

  it("manual reprint of an e-CF without security code: shows message instead of printing", async () => {
    mockCheckLocal.mockResolvedValueOnce(null);
    mockCheckCloud.mockResolvedValueOnce(null);

    const deps = createTestDeps();
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-reprint-no-code", ncf: "E310000000007", total: 1100 },
        numeroFactura: 16,
        isReprint: true,
      },
      deps
    );

    expect(mockShowWaitingNotice).not.toHaveBeenCalled();
    expect(mockPrintReceipt).not.toHaveBeenCalled();
    expect(mockShowMessage).toHaveBeenCalledWith(FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE, "info");
    expect(result.printed).toBe(false);
    expect(result.reason).toBe("reprint_pending");
  });

  it("manual reprint of an e-CF with security code: prints normally", async () => {
    mockCheckLocal.mockResolvedValueOnce({
      status: "accepted",
      dgii_security_code: "REPRINT-SEC",
      dgii_status: "accepted",
    } satisfies EcfDocumentState);

    const deps = createTestDeps();
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-reprint-has-code", ncf: "E310000000008", total: 1200 },
        numeroFactura: 17,
        isReprint: true,
      },
      deps
    );

    expect(mockShowWaitingNotice).not.toHaveBeenCalled();
    expect(mockPrintReceipt).toHaveBeenCalledTimes(1);
    expect(result.printed).toBe(true);
    expect(result.reason).toBe("already_ready");
  });

  it("manual reprint of an e-CF with security code in passed ecfDocument: prints immediately without lookup", async () => {
    const deps = createTestDeps();
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-reprint-passed-code", ncf: "E310000000009", total: 1250 },
        numeroFactura: 18,
        ecfDocument: {
          status: "accepted",
          dgii_security_code: "PASSED-SEC-CODE",
        },
        isReprint: true,
      },
      deps
    );

    expect(mockShowWaitingNotice).not.toHaveBeenCalled();
    expect(mockCheckLocal).not.toHaveBeenCalled();
    expect(mockCheckCloud).not.toHaveBeenCalled();
    expect(mockPrintReceipt).toHaveBeenCalledTimes(1);
    expect(mockPrintReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        ecfDocument: expect.objectContaining({ dgii_security_code: "PASSED-SEC-CODE" }),
      })
    );
    expect(result.printed).toBe(true);
    expect(result.reason).toBe("already_ready");
  });

  it("manual reprint of an e-CF when local mirror has no code but cloud has code: prints with cloud document", async () => {
    mockCheckLocal.mockResolvedValueOnce(null);
    mockCheckCloud.mockResolvedValueOnce({
      status: "accepted",
      dgii_security_code: "CLOUD-REPRINT-CODE",
      dgii_status: "accepted",
    } satisfies EcfDocumentState);

    const deps = createTestDeps();
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-reprint-cloud-code", ncf: "E310000000010", total: 1300 },
        numeroFactura: 19,
        ecfDocument: { dgii_track_id: "TRACK-123" },
        isReprint: true,
      },
      deps
    );

    expect(mockShowWaitingNotice).not.toHaveBeenCalled();
    expect(mockCheckLocal).toHaveBeenCalledTimes(1);
    expect(mockCheckCloud).toHaveBeenCalledTimes(1);
    expect(mockPrintReceipt).toHaveBeenCalledTimes(1);
    expect(mockPrintReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        ecfDocument: expect.objectContaining({
          dgii_track_id: "TRACK-123",
          dgii_security_code: "CLOUD-REPRINT-CODE",
        }),
      })
    );
    expect(result.printed).toBe(true);
    expect(result.reason).toBe("already_ready");
  });

  it("manual reprint of an e-CF when cloud rejects it: shows error message without printing", async () => {
    mockCheckLocal.mockResolvedValueOnce(null);
    mockCheckCloud.mockResolvedValueOnce({
      status: "rejected",
      dgii_status: "rejected",
      dgii_status_message: "Comprobante rechazado por vencimiento",
    } satisfies EcfDocumentState);

    const deps = createTestDeps();
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-reprint-cloud-reject", ncf: "E310000000011", total: 1400 },
        numeroFactura: 20,
        isReprint: true,
      },
      deps
    );

    expect(mockShowWaitingNotice).not.toHaveBeenCalled();
    expect(mockPrintReceipt).not.toHaveBeenCalled();
    expect(mockShowMessage).toHaveBeenCalledWith("Comprobante rechazado por vencimiento", "error");
    expect(result.printed).toBe(false);
    expect(result.reason).toBe("rejected");
  });

  it("manual reprint of a non-e-CF factura: prints immediately without gate or waiting", async () => {
    const deps = createTestDeps();
    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-reprint-b02", ncf: "B0200000050", total: 500 },
        numeroFactura: 21,
        isReprint: true,
      },
      deps
    );

    expect(mockShowWaitingNotice).not.toHaveBeenCalled();
    expect(mockCheckLocal).not.toHaveBeenCalled();
    expect(mockCheckCloud).not.toHaveBeenCalled();
    expect(mockPrintReceipt).toHaveBeenCalledTimes(1);
    expect(result.printed).toBe(true);
    expect(result.reason).toBe("not_ecf");
  });

  it("background retry prints when security code arrives later", async () => {
    // 1. Time out initially so it enters background queue
    mockCheckLocal.mockResolvedValue(null);
    mockCheckCloud.mockResolvedValue(null);

    const deps = createTestDeps();
    await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-bg-1", ncf: "E340000000001", total: 1300 },
        numeroFactura: 18,
      },
      deps
    );

    expect(getFiscalPrintBackgroundQueue().has("inv-bg-1")).toBe(true);
    expect(mockPrintReceipt).not.toHaveBeenCalled();

    // 2. Now simulate mirror receiving security code on background poll
    mockCheckLocal.mockResolvedValueOnce({
      status: "accepted",
      dgii_security_code: "BG-SEC-CODE",
      dgii_status: "accepted",
    } satisfies EcfDocumentState);

    await runBackgroundRetryOnce(deps);

    expect(mockPrintReceipt).toHaveBeenCalledTimes(1);
    expect(mockPrintReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        ecfDocument: expect.objectContaining({ dgii_security_code: "BG-SEC-CODE" }),
      })
    );
    expect(getFiscalPrintBackgroundQueue().has("inv-bg-1")).toBe(false);
  });

  describe("defaultCheckCloud", () => {
    it("selects cloud columns containing no dgii_status and treats {status:'accepted', dgii_security_code:'ABC123'} as ready", async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          status: "accepted",
          dgii_security_code: "ABC123",
          dgii_status_code: "0",
          dgii_status_message: "Aceptado",
        },
        error: null,
      });

      const cloudDoc = await defaultCheckCloud("tenant-xyz", "fac-999");

      expect(mockSupabase.from).toHaveBeenCalledWith("ecf_documents");
      expect(mockSupabase.select).toHaveBeenCalled();
      const selectedColumns = mockSupabase.select.mock.calls[0][0] as string;
      const columnList = selectedColumns.split(",").map((c: string) => c.trim());
      expect(columnList).not.toContain("dgii_status");
      expect(selectedColumns).not.toMatch(/\bdgii_status\b/);

      expect(cloudDoc).not.toBeNull();
      expect(cloudDoc?.status).toBe("accepted");
      expect(cloudDoc?.dgii_status).toBe("accepted");
      expect(cloudDoc?.dgii_security_code).toBe("ABC123");
      expect(extractSecurityCode(cloudDoc)).toBe("ABC123");

      // Verify it is treated as ready by gateFiscalPrint
      const printReceipt = vi.fn(async () => ({ ok: true }));
      const gateResult = await gateFiscalPrint(
        {
          tenantId: "tenant-xyz",
          factura: { id: "fac-999", ncf: "E310000000099", total: 100 },
          numeroFactura: 99,
          ecfDocument: cloudDoc,
        },
        { printReceipt }
      );

      expect(gateResult.printed).toBe(true);
      expect(gateResult.reason).toBe("already_ready");
      expect(printReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          ecfDocument: expect.objectContaining({
            status: "accepted",
            dgii_status: "accepted",
            dgii_security_code: "ABC123",
          }),
        })
      );
    });

    it("treats cloud row as ready during gate polling with defaultCheckCloud", async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          status: "accepted",
          dgii_security_code: "ABC123",
        },
        error: null,
      });

      const printReceipt = vi.fn(async () => ({ ok: true }));
      const gateResult = await gateFiscalPrint(
        {
          tenantId: "tenant-xyz",
          factura: { id: "fac-poll-cloud", ncf: "E310000000099", total: 100 },
          numeroFactura: 99,
        },
        {
          checkLocalMirror: vi.fn(async () => null),
          checkCloud: defaultCheckCloud,
          printReceipt,
          isOnline: () => true,
          showWaitingNotice: () => () => {},
          showMessage: () => {},
          pollDelays: [1],
          sleep: vi.fn(async () => undefined),
        }
      );

      expect(gateResult.printed).toBe(true);
      expect(gateResult.reason).toBe("code_arrived");
      expect(printReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          ecfDocument: expect.objectContaining({
            status: "accepted",
            dgii_status: "accepted",
            dgii_security_code: "ABC123",
          }),
        })
      );
    });
  });
});
