import { describe, expect, it } from "vitest";
import {
  FISCAL_CUSTOMER_REQUIRED_MESSAGE,
  getFiscalCustomerIssue,
  resolveInvoiceCustomerName,
} from "./fiscalCustomerRequirement";

describe("fiscalCustomerRequirement", () => {
  it("returns null when solicitaComprobante switch is off", () => {
    const issue = getFiscalCustomerIssue({
      fiscalActive: true,
      solicitaComprobante: false,
      ncfType: "E31",
      customer: null,
    });
    expect(issue).toBeNull();
  });

  it("returns null when fiscalActive is false even if switch is on", () => {
    const issue = getFiscalCustomerIssue({
      fiscalActive: false,
      solicitaComprobante: true,
      ncfType: "E31",
      customer: null,
    });
    expect(issue).toBeNull();
  });

  it("returns null for NCF types not requiring a client (E32, B02)", () => {
    expect(
      getFiscalCustomerIssue({
        fiscalActive: true,
        solicitaComprobante: true,
        ncfType: "E32",
        customer: null,
      })
    ).toBeNull();

    expect(
      getFiscalCustomerIssue({
        fiscalActive: true,
        solicitaComprobante: true,
        ncfType: "B02",
        customer: null,
      })
    ).toBeNull();
  });

  it("returns warning message for E31 and B01 when no customer is selected", () => {
    expect(
      getFiscalCustomerIssue({
        fiscalActive: true,
        solicitaComprobante: true,
        ncfType: "E31",
        customer: null,
      })
    ).toBe(FISCAL_CUSTOMER_REQUIRED_MESSAGE);

    expect(
      getFiscalCustomerIssue({
        fiscalActive: true,
        solicitaComprobante: true,
        ncfType: "B01",
        customer: undefined,
      })
    ).toBe(FISCAL_CUSTOMER_REQUIRED_MESSAGE);
  });

  it("returns warning message when customer has no document_id or empty document_id", () => {
    expect(
      getFiscalCustomerIssue({
        fiscalActive: true,
        solicitaComprobante: true,
        ncfType: "E31",
        customer: {
          name: "Acme SRL",
          document_id: null,
        },
      })
    ).toBe(FISCAL_CUSTOMER_REQUIRED_MESSAGE);

    expect(
      getFiscalCustomerIssue({
        fiscalActive: true,
        solicitaComprobante: true,
        ncfType: "B01",
        customer: {
          name: "Acme SRL",
          document_id: "   ",
        },
      })
    ).toBe(FISCAL_CUSTOMER_REQUIRED_MESSAGE);
  });

  it("returns warning message when customer has empty or whitespace name", () => {
    expect(
      getFiscalCustomerIssue({
        fiscalActive: true,
        solicitaComprobante: true,
        ncfType: "E31",
        customer: {
          name: "",
          document_id: "132239695",
        },
      })
    ).toBe(FISCAL_CUSTOMER_REQUIRED_MESSAGE);

    expect(
      getFiscalCustomerIssue({
        fiscalActive: true,
        solicitaComprobante: true,
        ncfType: "B01",
        customer: {
          name: "   \t\n  ",
          document_id: "132239695",
        },
      })
    ).toBe(FISCAL_CUSTOMER_REQUIRED_MESSAGE);
  });

  it("returns null when customer has both valid name and document_id", () => {
    const issue = getFiscalCustomerIssue({
      fiscalActive: true,
      solicitaComprobante: true,
      ncfType: "E31",
      customer: {
        name: "AGROTAV SRL",
        document_id: "132-23969-5",
      },
    });
    expect(issue).toBeNull();
  });
});

describe("resolveInvoiceCustomerName", () => {
  it("prioritizes selected customer name over typed search text", () => {
    expect(
      resolveInvoiceCustomerName(
        { name: "Agrotav SRL" },
        "agro"
      )
    ).toBe("Agrotav SRL");

    expect(
      resolveInvoiceCustomerName(
        { name: "  Agrotav SRL  " },
        "   different typed text   "
      )
    ).toBe("Agrotav SRL");
  });

  it("falls back to typed name when no customer is selected", () => {
    expect(
      resolveInvoiceCustomerName(null, "Juan Perez")
    ).toBe("Juan Perez");

    expect(
      resolveInvoiceCustomerName(undefined, "  Maria Lopez  ")
    ).toBe("Maria Lopez");

    expect(
      resolveInvoiceCustomerName({ name: null }, "Pedro Gomez")
    ).toBe("Pedro Gomez");

    expect(
      resolveInvoiceCustomerName({ name: "" }, "Carlos Diaz")
    ).toBe("Carlos Diaz");
  });

  it("returns empty string when both customer name and typed text are empty or whitespace", () => {
    expect(resolveInvoiceCustomerName(null, "")).toBe("");
    expect(resolveInvoiceCustomerName(null, "   ")).toBe("");
    expect(resolveInvoiceCustomerName(undefined, undefined)).toBe("");
    expect(resolveInvoiceCustomerName({ name: "   " }, "   ")).toBe("");
    expect(resolveInvoiceCustomerName({ name: "" }, "")).toBe("");
  });
});
