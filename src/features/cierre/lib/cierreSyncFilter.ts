export const CIERRE_RELEVANT_TABLES = [
  'cierres_operativos',
  'consumos',
  'facturas',
  'gastos',
  'gasto_categorias',
  'mesas_estado',
  'comandas',
] as const;

export type CierreRelevantTable = (typeof CIERRE_RELEVANT_TABLES)[number];

const RELEVANT_TABLE_SET = new Set<string>(CIERRE_RELEVANT_TABLES);

/**
 * Returns true if the changed tables intersect with tables relevant to Cierre.
 * If tables is missing, null, or empty, returns true to stay safe.
 */
export function isTableRelevantForCierre(tables?: readonly string[] | null): boolean {
  if (!tables || tables.length === 0) {
    return true;
  }
  return tables.some((tbl) => RELEVANT_TABLE_SET.has(tbl));
}
