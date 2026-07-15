import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Index remediation migration', () => {
  const migrationFile = '20260715000000_add-foreign-key-and-rls-indexes.sql';
  const filePath = path.join(__dirname, '../migrations', migrationFile);

  const getMigrationContent = () => fs.readFileSync(filePath, 'utf-8');

  it('migration file exists and is BOM-free', () => {
    expect(fs.existsSync(filePath)).toBe(true);
    const buffer = fs.readFileSync(filePath);
    const hasBOM = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;
    expect(hasBOM).toBe(false);
  });

  it('contains no unauthorized mutations (comments stripped)', () => {
    let content = getMigrationContent();
    
    // Strip comments (multi-line and single-line)
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    content = content.replace(/--.*$/gm, '');
    
    const badKeywords = [
      'DROP ', 'BEGIN', 'COMMIT', 'ROLLBACK', 'ALTER ', 'CREATE TABLE', 
      'GRANT ', 'REVOKE ', 'CREATE POLICY', 'DELETE ', 'UPDATE ', 'INSERT ', 
      'CREATE FUNCTION', 'ALTER FUNCTION', 'DROP FUNCTION', 'TRUNCATE '
    ];
    const upperContent = content.toUpperCase();
    
    for (const keyword of badKeywords) {
      expect(upperContent).not.toContain(keyword);
    }
  });

  it('rejects boolean indexes', () => {
    const content = getMigrationContent();
    expect(content).not.toContain('activa');
    expect(content).not.toContain('activo');
    expect(content).not.toContain('email');
  });

  it('verifies exact 58 expected pairs, one index per pair, unique names, strict format', () => {
    let content = getMigrationContent();
    // Strip comments
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    content = content.replace(/--.*$/gm, '');
    
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    expect(lines.length).toBe(58);
    
    const expectedPairsList = [
      ['cuentas_cobrar', 'sucursal_id'], ['cuentas_cobrar', 'factura_id'], ['cuentas_cobrar', 'customer_id'],
      ['cxp_pagos', 'sucursal_id'], ['cxp_pagos', 'cycle_id'], ['cxp_pagos', 'created_by_auth_user_id'], ['cxp_pagos', 'cuenta_pagar_id'],
      ['cxc_pagos', 'created_by_auth_user_id'], ['cxc_pagos', 'cycle_id'], ['cxc_pagos', 'sucursal_id'], ['cxc_pagos', 'cuenta_cobrar_id'],
      ['compra_detalles', 'tenant_id'], ['compra_detalles', 'compra_id'], ['compra_detalles', 'producto_id'],
      ['digital_order_items', 'plato_id'], ['digital_order_items', 'order_id'],
      ['recetas', 'tenant_id'], ['recetas', 'insumo_id'],
      ['compras', 'usuario_id'], ['compras', 'tenant_id'], ['compras', 'proveedor_id'], ['compras', 'sucursal_id'],
      ['digital_menu_items', 'plato_id'],
      ['gastos', 'category_id'], ['gastos', 'sucursal_id'], ['gastos', 'cycle_id'],
      ['sucursales', 'tenant_id'],
      ['ecf_document_events', 'ecf_document_id'],
      ['digital_menu_settings', 'sucursal_id'],
      ['produccion_cocina', 'producto_id'], ['produccion_cocina', 'sucursal_id'], ['produccion_cocina', 'tenant_id'],
      ['productos_inventario', 'sucursal_id'], ['productos_inventario', 'tenant_id'],
      ['fiscal_outbox', 'factura_id'],
      ['facturas', 'customer_id'], ['facturas', 'sucursal_id'],
      ['inventario_movimientos', 'sucursal_id'], ['inventario_movimientos', 'tenant_id'], ['inventario_movimientos', 'producto_id'], ['inventario_movimientos', 'usuario_id'],
      ['ecf_documents', 'batch_id'], ['ecf_documents', 'certificate_metadata_id'],
      ['consumos', 'plato_id'], ['consumos', 'sucursal_id'],
      ['platos', 'sucursal_id'],
      ['mesas_estado', 'sucursal_id'],
      ['gasto_categorias', 'sucursal_id'],
      ['cocina_estado', 'sucursal_id'],
      ['proveedores', 'tenant_id'],
      ['menu_categories', 'sucursal_id'],
      ['cierres_operativos', 'sucursal_id'],
      ['comandas', 'sucursal_id'],
      ['cuentas_pagar', 'sucursal_id'], ['cuentas_pagar', 'proveedor_id'], ['cuentas_pagar', 'compra_id'],
      ['payments', 'tenant_id'],
      ['digital_orders', 'sucursal_id']
    ];
    
    expect(expectedPairsList.length).toBe(58);
    const expectedSet = new Set(expectedPairsList.map(p => `${p[0]}.${p[1]}`));
    expect(expectedSet.size).toBe(58);
    
    const indexNames = new Set();
    const foundPairs = new Set();
    
    for (const line of lines) {
      // Anchored canonical regex
      const match = line.match(/^CREATE INDEX IF NOT EXISTS (idx_[a-zA-Z0-9_]+) ON public\.([a-zA-Z0-9_]+) \(([a-zA-Z0-9_]+)\);$/);
      if (!match) {
        throw new Error(`Line does not match canonical format: ${line}`);
      }
      expect(match).toBeTruthy();
      
      const [, idxName, tableName, colName] = match;
      
      expect(indexNames.has(idxName)).toBe(false); // uniqueness of index names
      indexNames.add(idxName);
      
      const pair = `${tableName}.${colName}`;
      expect(foundPairs.has(pair)).toBe(false); // uniqueness of pairs
      foundPairs.add(pair);
    }
    
    expect(foundPairs.size).toBe(58);
    
    // Bidirectional equality
    for (const p of foundPairs) {
      expect(expectedSet.has(p)).toBe(true);
    }
    for (const p of expectedSet) {
      expect(foundPairs.has(p)).toBe(true);
    }
  });
});