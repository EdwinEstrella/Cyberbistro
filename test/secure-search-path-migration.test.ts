import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Secure search_path migration', () => {
  const migrationFile = '20260715000001_secure-search-path.sql';
  const filePath = path.join(__dirname, '../migrations', migrationFile);

  const getMigrationContent = () => fs.readFileSync(filePath, 'utf-8');

  it('migration file exists and is BOM-free', () => {
    expect(fs.existsSync(filePath)).toBe(true);
    const buffer = fs.readFileSync(filePath);
    const hasBOM = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;
    expect(hasBOM).toBe(false);
  });

  it('contains exactly 5 signature-qualified ALTER FUNCTION statements and no other executable SQL', () => {
    let content = getMigrationContent();
    
    // Strip comments
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    content = content.replace(/--.*$/gm, '');
    
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    expect(lines.length).toBe(5);
    
    const expectedStatements = [
      'ALTER FUNCTION public.can_use_tenant_realtime_channel(uuid, text) SET search_path = pg_catalog, public, pg_temp;',
      'ALTER FUNCTION public.realtime_notify_cocina_estado() SET search_path = pg_catalog, public, pg_temp;',
      'ALTER FUNCTION public.realtime_notify_comandas() SET search_path = pg_catalog, public, pg_temp;',
      'ALTER FUNCTION public.realtime_notify_digital_orders() SET search_path = pg_catalog, public, pg_temp;',
      'ALTER FUNCTION public.sync_factura_fiscal_status() SET search_path = pg_catalog, public, pg_temp;'
    ];

    for (let i = 0; i < 5; i++) {
      expect(lines[i]).toBe(expectedStatements[i]);
    }
  });

  it('contains no unauthorized mutations (CREATE, DROP, GRANT, REVOKE, DELETE, UPDATE, INSERT, etc)', () => {
    let content = getMigrationContent();
    
    // Strip comments
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    content = content.replace(/--.*$/gm, '');
    
    const badKeywords = [
      'DROP ', 'BEGIN', 'COMMIT', 'ROLLBACK', 'CREATE TABLE', 
      'GRANT ', 'REVOKE ', 'CREATE POLICY', 'DELETE ', 'UPDATE ', 'INSERT ', 
      'CREATE FUNCTION', 'DROP FUNCTION', 'TRUNCATE '
    ];
    
    const upperContent = content.toUpperCase();
    
    for (const keyword of badKeywords) {
      expect(upperContent).not.toContain(keyword);
    }
  });
});
