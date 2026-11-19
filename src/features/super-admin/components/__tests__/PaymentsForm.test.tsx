import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentsForm } from "../PaymentsForm";
import type { LimitDraft, TenantBillingPaymentRow } from "../../lib/types";
import { nextBillingDateAfter, formatBillingDateDisplay } from "../../../../shared/lib/monthlyFee";

describe("PaymentsForm", () => {
  const baseDraft: LimitDraft = {
    userLimitEnabled: true,
    adminUserLimit: "1",
    cajeraUserLimit: "2",
    cocinaUserLimit: "2",
    meseroUserLimit: "2",
    sucursalLimitEnabled: true,
    sucursalLimit: "1",
    paymentDayOfMonth: "15",
    monthlyFeeAmount: "1500",
    monthlyFeeCurrency: "DOP",
    debtAmount: "3000",
    debtCurrency: "DOP",
    debtDueDate: "2026-11-20",
  };

  it("renders Cuota mensual section with helper text and inputs", () => {
    const html = renderToStaticMarkup(
      <PaymentsForm
        draft={baseDraft}
        initialDraft={baseDraft}
        tenantId="tenant-1"
        tenantName="Test Restaurant"
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(html).toContain("Cuota mensual");
    expect(html).toContain(
      "Cada mes, el día de pago, esta cuota se suma al saldo pendiente. El primer cobro es el próximo día de pago."
    );
    expect(html).toContain('id="monthly-fee-amount-input"');
    expect(html).toContain('id="monthly-fee-currency-select"');
    expect(html).toContain('id="payment-day-input"');
  });

  it("computes and displays next charge preview when fee > 0 and payment day is set", () => {
    const nextIso = nextBillingDateAfter(15, new Date());
    const expectedPreview = `Próximo cobro: ${formatBillingDateDisplay(nextIso)}`;

    const html = renderToStaticMarkup(
      <PaymentsForm
        draft={baseDraft}
        initialDraft={baseDraft}
        tenantId="tenant-1"
        tenantName="Test Restaurant"
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(html).toContain(expectedPreview);
  });

  it("does not show next charge preview when fee is 0 or empty", () => {
    const noFeeDraft: LimitDraft = {
      ...baseDraft,
      monthlyFeeAmount: "",
    };

    const html = renderToStaticMarkup(
      <PaymentsForm
        draft={noFeeDraft}
        initialDraft={noFeeDraft}
        tenantId="tenant-1"
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(html).not.toContain("Próximo cobro:");
  });

  it("renders Saldo pendiente section and disables currency select when monthly fee > 0", () => {
    const html = renderToStaticMarkup(
      <PaymentsForm
        draft={baseDraft}
        initialDraft={baseDraft}
        tenantId="tenant-1"
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(html).toContain("Saldo pendiente");
    expect(html).toContain('id="debt-amount-input"');
    expect(html).toContain('id="debt-currency-select"');
    // Disabled attribute when fee > 0
    expect(html).toMatch(/<select[^>]*id="debt-currency-select"[^>]*disabled/);
  });

  it("disables balance currency select whenever fee > 0 even if balance is 0 or empty", () => {
    const zeroDebtDraft: LimitDraft = {
      ...baseDraft,
      monthlyFeeAmount: "1500",
      debtAmount: "0",
    };

    const html = renderToStaticMarkup(
      <PaymentsForm
        draft={zeroDebtDraft}
        initialDraft={zeroDebtDraft}
        tenantId="tenant-1"
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(html).toMatch(/<select[^>]*id="debt-currency-select"[^>]*disabled/);
  });

  it("keeps balance currency select enabled when there is no recurring fee", () => {
    const noFeeDraft: LimitDraft = {
      ...baseDraft,
      monthlyFeeAmount: "0",
    };

    const html = renderToStaticMarkup(
      <PaymentsForm
        draft={noFeeDraft}
        initialDraft={noFeeDraft}
        tenantId="tenant-1"
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(html).not.toMatch(/<select[^>]*id="debt-currency-select"[^>]*disabled/);
  });

  it("renders Pagó button when initial debt > 0", () => {
    const html = renderToStaticMarkup(
      <PaymentsForm
        draft={baseDraft}
        initialDraft={baseDraft}
        tenantId="tenant-1"
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        onMarkPaid={vi.fn()}
      />
    );

    expect(html).toContain("Pagó");
  });

  it("hides Pagó button when initial debt is empty or zero", () => {
    const noDebtInitial: LimitDraft = {
      ...baseDraft,
      debtAmount: "",
    };

    const html = renderToStaticMarkup(
      <PaymentsForm
        draft={noDebtInitial}
        initialDraft={noDebtInitial}
        tenantId="tenant-1"
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        onMarkPaid={vi.fn()}
      />
    );

    expect(html).not.toContain("Pagó");
  });

  it("renders Historial de pagos empty state when payments list is empty", () => {
    const html = renderToStaticMarkup(
      <PaymentsForm
        draft={baseDraft}
        initialDraft={baseDraft}
        tenantId="tenant-1"
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        paymentHistory={[]}
      />
    );

    expect(html).toContain("Historial de pagos");
    expect(html).toContain("Todavía no hay pagos registrados.");
  });

  it("renders Historial de pagos rows with date, amount, currency, and notes", () => {
    const mockPayments: TenantBillingPaymentRow[] = [
      {
        id: "p1",
        tenant_id: "tenant-1",
        amount: 4500,
        currency: "DOP",
        paid_at: "2026-11-13T15:30:00.000Z",
        notes: "Pago en efectivo",
      },
      {
        id: "p2",
        tenant_id: "tenant-1",
        amount: 1500,
        currency: "DOP",
        paid_at: "2026-10-13T10:00:00.000Z",
        notes: null,
      },
    ];

    const html = renderToStaticMarkup(
      <PaymentsForm
        draft={baseDraft}
        initialDraft={baseDraft}
        tenantId="tenant-1"
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        paymentHistory={mockPayments}
      />
    );

    expect(html).toContain("Historial de pagos");
    expect(html).toContain("RD$ 4,500.00");
    expect(html).toContain("Pago en efectivo");
    expect(html).toContain("RD$ 1,500.00");
    expect(html).toContain("—");
  });
});
