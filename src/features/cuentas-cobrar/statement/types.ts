export interface CompanyStatementCustomer {
  name: string;
  document_id: string | null;
}

export interface CompanyStatementRow {
  date: string;
  numero_pedido: number;
  employee_name: string | null;
  monto_total: number;
  monto_pagado: number;
}

export interface CompanyStatementTotals {
  count: number;
  total: number;
  paid: number;
  pending: number;
}

export interface CompanyStatementData {
  customer: CompanyStatementCustomer;
  from: string;
  to: string;
  rows: CompanyStatementRow[];
  totals: CompanyStatementTotals;
}

export interface EmployeeSummaryItem {
  employeeName: string;
  orderCount: number;
  totalAmount: number;
}

export interface StatementTenantInfo {
  nombre_negocio?: string | null;
  rnc?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  logo_url?: string | null;
  moneda?: string | null;
}

export interface DateRangeValidation {
  valid: boolean;
  error?: string;
}
