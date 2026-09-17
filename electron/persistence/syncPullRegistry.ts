/**
 * Single source of truth for cloud→local pull (download) tables — shape only.
 *
 * Every table downloaded from Supabase into the local SQLite mirror is declared
 * here exactly once. This module intentionally holds no persistence logic: the
 * cloud-transport client reads {@link remoteTable}/{@link child} to fetch rows,
 * and the local store maps {@link localTable} to its own applier. Keeping apply
 * functions out of here preserves the transport↔persistence boundary so the
 * sync client never imports the DB layer.
 *
 * Adding a table to the download path is one entry here plus its applier in the
 * store, instead of edits scattered across the client's pull list, the store's
 * pullable set, its apply dispatch, and its delete-reconciliation loop.
 */
export interface SyncPullTable {
  /** Cloud (Supabase) table name. */
  remoteTable: string;
  /** Local SQLite table name. */
  localTable: string;
  /** True when the cloud table has no direct tenant_id and is scoped via a parent join. */
  child: boolean;
  /** True when absent-from-snapshot rows should be reconciled as remote hard deletes. */
  deletable: boolean;
}

export const SYNC_PULL_TABLES: readonly SyncPullTable[] = [
  { remoteTable: "nomina_empleados", localTable: "payroll_employees", child: false, deletable: true },
  { remoteTable: "nomina_pagos", localTable: "payroll_payments", child: true, deletable: true },
  { remoteTable: "nomina_ajustes", localTable: "payroll_cloud_adjustments", child: true, deletable: true },
  { remoteTable: "gasto_categorias", localTable: "gasto_categorias", child: false, deletable: true },
  { remoteTable: "gastos", localTable: "gastos", child: false, deletable: true },
  { remoteTable: "customers", localTable: "customers", child: false, deletable: true },
  // Operational cycles download for analytics grouping. Never hard-deleted via
  // pull: a cycle absent from a snapshot page must survive locally.
  { remoteTable: "cierres_operativos", localTable: "cierres_operativos", child: false, deletable: false },
  // Invoices download for analytics (ventas) and the local-first invoice list.
  // Not hard-deleted via pull: invoice deletion is audited, never a silent
  // snapshot-absence removal.
  { remoteTable: "facturas", localTable: "facturas", child: false, deletable: false },
  // Purchases download for the compras module and finance analytics. Not
  // hard-deleted via pull: a purchase absent from a snapshot page survives.
  { remoteTable: "compras", localTable: "compras", child: false, deletable: false },
  // Accounts receivable/payable + their payments for the finance analytics
  // (por cobrar / por pagar). Accounts MUST precede their payments so the
  // payment foreign keys resolve within a single pull batch. Not hard-deleted
  // via pull. cloud monto_pagado is mapped to local monto_pendiente on apply.
  { remoteTable: "cuentas_cobrar", localTable: "cuentas_cobrar", child: false, deletable: false },
  { remoteTable: "cxc_pagos", localTable: "cxc_pagos", child: false, deletable: false },
  { remoteTable: "cuentas_pagar", localTable: "cuentas_pagar", child: false, deletable: false },
  { remoteTable: "cxp_pagos", localTable: "cxp_pagos", child: false, deletable: false },
] as const;

/** Local table names whose cloud→local pull is implemented. */
export const SYNC_PULLABLE_LOCAL_TABLES: ReadonlySet<string> = new Set(SYNC_PULL_TABLES.map((table) => table.localTable));

/**
 * Delete-reconciliation order: children before parents so foreign keys never
 * block a legitimate remote hard delete. Declared explicitly to preserve the
 * exact historical order the store relied on; new deletable tables must be
 * inserted at the position that respects their foreign-key dependencies.
 */
export const SYNC_PULL_DELETE_ORDER: readonly string[] = [
  "gastos",
  "payroll_cloud_adjustments",
  "payroll_payments",
  "payroll_employees",
  "gasto_categorias",
  "customers",
];
