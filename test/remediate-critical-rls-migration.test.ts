import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Critical RLS Remediation Migration Contract', () => {
  const MIGRATION_FILE = '20260715000002_remediate-critical-rls.sql';
  const migrationPath = path.join(process.cwd(), 'migrations', MIGRATION_FILE);
  let statements: string[] = [];

  beforeAll(() => {
    const rawContent = fs.readFileSync(migrationPath, 'utf8');
    
    // Strip block comments and line comments safely
    let content = rawContent.replace(/\/\*[\s\S]*?\*\//g, '');
    content = content.replace(/--.*$/gm, '');

    // Parse complete semicolon-terminated SQL statements
    statements = content
      .split(';')
      .map(s => s.trim().replace(/\s+/g, ' '))
      .filter(s => s.length > 0);
  });

  it('has exact canonical filename and no BOM', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const rawContent = fs.readFileSync(migrationPath, 'utf8');
    expect(rawContent.charCodeAt(0)).not.toBe(0xFEFF);
  });

  it('contains exactly the allowed statements', () => {
    const expectedStatements = [
      'ALTER FUNCTION public.cyberbistro_is_super_admin() SECURITY DEFINER',
      'ALTER FUNCTION public.cyberbistro_is_super_admin() SET search_path = pg_catalog, public, pg_temp',
      'ALTER FUNCTION public.cloudix_is_super_admin() SECURITY DEFINER',
      'ALTER FUNCTION public.cloudix_is_super_admin() SET search_path = pg_catalog, public, pg_temp',
      
      'ALTER TABLE public.measurement_units ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE public.permission_catalog ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE public.cyberbistro_super_admins ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE public.cloudix_super_admins ENABLE ROW LEVEL SECURITY',
      
      'REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.measurement_units FROM anon, authenticated',
      'REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payments FROM anon, authenticated',
      'REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.permission_catalog FROM anon, authenticated',
      'REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.cyberbistro_super_admins FROM anon, authenticated',
      'REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.cloudix_super_admins FROM anon, authenticated'
    ];

    expect(statements).toHaveLength(14);
    
    // Ensure all parsed statements match the expected list exactly
    const sortedExpected = [...expectedStatements].sort();
    const sortedActual = [...statements].sort();
    
    expect(sortedActual).toEqual(sortedExpected);
  });

  it('contains no unexpected statement types', () => {
    const rawContent = fs.readFileSync(migrationPath, 'utf8');
    expect(rawContent).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(rawContent).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
    expect(rawContent).not.toMatch(/GRANT /i);
    expect(rawContent).not.toMatch(/SECURITY INVOKER/i);
    expect(rawContent).not.toMatch(/CREATE OR REPLACE/i);
    expect(rawContent).not.toMatch(/CREATE POLICY/i);
    expect(rawContent).not.toMatch(/DROP /i);
  });
});
