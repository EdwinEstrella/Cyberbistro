import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  let inDollarQuote = false;
  let dollarTag = '';
  let inLineComment = false;
  let inBlockComment = false;
  
  while (i < sql.length) {
    const char = sql[i];
    const nextChar = sql[i + 1] || '';
    
    if (inLineComment) {
      current += char;
      if (char === '\n') {
        inLineComment = false;
      }
      i++;
      continue;
    }
    if (inBlockComment) {
      current += char;
      if (char === '*' && nextChar === '/') {
        current += nextChar;
        inBlockComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    
    if (!inDollarQuote) {
      if (char === '-' && nextChar === '-') {
        inLineComment = true;
        current += char + nextChar;
        i += 2;
        continue;
      }
      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        current += char + nextChar;
        i += 2;
        continue;
      }
      if (char === '$') {
        const tagMatch = sql.slice(i).match(/^\$[a-zA-Z0-9_]*\$/);
        if (tagMatch) {
          inDollarQuote = true;
          dollarTag = tagMatch[0];
          current += tagMatch[0];
          i += tagMatch[0].length;
          continue;
        }
      }
      if (char === ';') {
        current += char;
        if (current.trim().length > 0) {
          statements.push(current.trim());
        }
        current = '';
        i++;
        continue;
      }
    } else {
      if (char === '$' && sql.slice(i).startsWith(dollarTag)) {
        inDollarQuote = false;
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    
    current += char;
    i++;
  }
  if (current.trim().length > 0) {
    statements.push(current.trim());
  }
  return statements;
}

function extractFunctionBody(sql: string, funcName: string): string {
  const startRegex = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${funcName}\\(.*?\\).*?(\\$[a-zA-Z0-9_]*\\$)`, 'is');
  const startMatch = sql.match(startRegex);
  if (!startMatch) throw new Error(`Function ${funcName} not found`);

  const openingTag = startMatch[1];
  const bodyStartIndex = startMatch.index! + startMatch[0].length;

  const closingIndex = sql.indexOf(openingTag, bodyStartIndex);
  if (closingIndex === -1) {
    throw new Error(`Function ${funcName} terminator not found`);
  }

  const contentBetween = sql.slice(bodyStartIndex, closingIndex);
  if (/CREATE OR REPLACE FUNCTION/is.test(contentBetween)) {
    throw new Error(`Function ${funcName} terminator is ambiguous or missing (crosses boundary)`);
  }

  return sql.slice(startMatch.index!, closingIndex + openingTag.length);
}

function validateGuard(body: string, funcName: string) {
  if (!body.includes('v_auth_user_id uuid := public.cloudix_auth_user_id();')) {
    throw new Error(`${funcName} missing auth user id assignment`);
  }
  if (!body.match(/IF v_auth_user_id IS NULL THEN\s*RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';\s*END IF;/i)) {
    throw new Error(`${funcName} missing NULL denial guard`);
  }
  if (!body.match(/SELECT 1 FROM public\.tenant_users\s*WHERE auth_user_id = v_auth_user_id\s*AND tenant_id = p_tenant_id\s*AND activo = true/i)) {
    throw new Error(`${funcName} missing membership query`);
  }
  const memberDenialRegex = /IF NOT v_is_member THEN\s*RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';\s*END IF;/i;
  const memberDenialMatch = body.match(memberDenialRegex);
  if (!memberDenialMatch) {
    throw new Error(`${funcName} missing membership denial guard`);
  }
  const guardEndIndex = memberDenialMatch.index! + memberDenialMatch[0].length;
  const mutations = ['FOR UPDATE', 'UPDATE public.tenants', 'INSERT ', 'DELETE '];
  for (const mut of mutations) {
    const mutIndex = body.indexOf(mut);
    if (mutIndex !== -1 && mutIndex < guardEndIndex) {
      throw new Error(`${funcName} contains mutation '${mut}' before guard completion`);
    }
  }
  if (body.match(/auth\.uid\(\)/i) || body.match(/email/i)) {
    throw new Error(`${funcName} contains fallback to auth.uid() or email`);
  }
}

function validateObsoleteDoBlock(stmt: string, signature: string, revokeLiteral: string) {
  const normalized = stmt.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^DO (\$([a-zA-Z0-9_]*)\$) BEGIN IF to_regprocedure\('([^']+)'\) IS NOT NULL THEN EXECUTE '([^']+)'; END IF; END; (\$[a-zA-Z0-9_]*\$);$/i);
  
  if (!match) {
    throw new Error('DO block structure invalid or contains additional logic: ' + normalized);
  }
  const [ , openingTag, , actualSig, actualRevoke, closingTag ] = match;
  if (openingTag !== closingTag) {
    throw new Error('DO block dollar tags mismatch');
  }
  if (actualSig !== signature) {
    throw new Error(`DO block signature mismatch. Expected ${signature}, got ${actualSig}`);
  }
  if (actualRevoke !== revokeLiteral) {
    throw new Error(`DO block revoke literal mismatch. Expected ${revokeLiteral}, got ${actualRevoke}`);
  }
}

function validateMigration(sql: string) {
  if (sql.charCodeAt(0) === 0xFEFF) {
    throw new Error('Migration contains BOM');
  }

  const statements = splitStatements(sql);

  let dropPolicyCount = 0;
  let revokeInsertCount = 0;
  let regRevokeCount = 0;
  let regGrantCount = 0;
  let regAlterCount = 0;
  let ecfCreateCount = 0;
  let ecfRevokeCount = 0;
  let ecfGrantCount = 0;
  let ncfCreateCount = 0;
  let ncfRevokeCount = 0;
  let ncfGrantCount = 0;
  let doBlockObsolete1Count = 0;
  let doBlockObsolete2Count = 0;

  for (const stmt of statements) {
    const cleanStmt = stmt.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!cleanStmt) continue;

    if (/^DROP POLICY IF EXISTS cb_tenants_auth_insert ON public\.tenants;$/i.test(cleanStmt)) { dropPolicyCount++; continue; }
    if (/^REVOKE INSERT ON public\.tenants FROM anon, authenticated;$/i.test(cleanStmt)) { revokeInsertCount++; continue; }
    if (/^REVOKE EXECUTE ON FUNCTION public\.cyberbistro_register_tenant.*?FROM PUBLIC, anon, authenticated;$/is.test(cleanStmt)) { regRevokeCount++; continue; }
    if (/^GRANT EXECUTE ON FUNCTION public\.cyberbistro_register_tenant.*?TO authenticated;$/is.test(cleanStmt)) { regGrantCount++; continue; }
    if (/^ALTER FUNCTION public\.cyberbistro_register_tenant.*?SET search_path TO pg_catalog, public, pg_temp;$/is.test(cleanStmt)) { regAlterCount++; continue; }
    
    if (/^CREATE OR REPLACE FUNCTION public\.cloudix_reserve_ecf.*?\$function\$;$/is.test(cleanStmt)) { 
      ecfCreateCount++; 
      validateGuard(stmt, 'cloudix_reserve_ecf');
      continue; 
    }
    if (/^REVOKE EXECUTE ON FUNCTION public\.cloudix_reserve_ecf.*?FROM PUBLIC, anon, authenticated;$/is.test(cleanStmt)) { ecfRevokeCount++; continue; }
    if (/^GRANT EXECUTE ON FUNCTION public\.cloudix_reserve_ecf.*?TO authenticated;$/is.test(cleanStmt)) { ecfGrantCount++; continue; }
    
    if (/^CREATE OR REPLACE FUNCTION public\.cloudix_reserve_ncf.*?\$function\$;$/is.test(cleanStmt)) { 
      ncfCreateCount++; 
      validateGuard(stmt, 'cloudix_reserve_ncf');
      continue; 
    }
    if (/^REVOKE EXECUTE ON FUNCTION public\.cloudix_reserve_ncf.*?FROM PUBLIC, anon, authenticated;$/is.test(cleanStmt)) { ncfRevokeCount++; continue; }
    if (/^GRANT EXECUTE ON FUNCTION public\.cloudix_reserve_ncf.*?TO authenticated;$/is.test(cleanStmt)) { ncfGrantCount++; continue; }
    
    if (/^DO\s+\$[a-zA-Z0-9_]*\$/i.test(cleanStmt)) {
      if (cleanStmt.includes('cyberbistro_reserve_ncf')) {
        validateObsoleteDoBlock(
          cleanStmt, 
          'public.cyberbistro_reserve_ncf(uuid,text)', 
          'REVOKE EXECUTE ON FUNCTION public.cyberbistro_reserve_ncf(uuid, text) FROM PUBLIC, anon, authenticated;'
        );
        doBlockObsolete1Count++;
        continue;
      }
      if (cleanStmt.includes('zyron_next_invoice_number')) {
        validateObsoleteDoBlock(
          cleanStmt, 
          'public.zyron_next_invoice_number(uuid,text)', 
          'REVOKE EXECUTE ON FUNCTION public.zyron_next_invoice_number(uuid, text) FROM PUBLIC, anon, authenticated;'
        );
        doBlockObsolete2Count++;
        continue;
      }
    }
    
    throw new Error('Unrecognized or un-allowed top-level statement: ' + cleanStmt.substring(0, 100));
  }

  if (dropPolicyCount !== 1) throw new Error('Incorrect dropPolicyCount');
  if (revokeInsertCount !== 1) throw new Error('Incorrect revokeInsertCount');
  if (regRevokeCount !== 1) throw new Error('Incorrect regRevokeCount');
  if (regGrantCount !== 1) throw new Error('Incorrect regGrantCount');
  if (regAlterCount !== 1) throw new Error('Incorrect regAlterCount');
  if (ecfCreateCount !== 1) throw new Error('Incorrect ecfCreateCount');
  if (ecfRevokeCount !== 1) throw new Error('Incorrect ecfRevokeCount');
  if (ecfGrantCount !== 1) throw new Error('Incorrect ecfGrantCount');
  if (ncfCreateCount !== 1) throw new Error('Incorrect ncfCreateCount');
  if (ncfRevokeCount !== 1) throw new Error('Incorrect ncfRevokeCount');
  if (ncfGrantCount !== 1) throw new Error('Incorrect ncfGrantCount');
  if (doBlockObsolete1Count !== 1) throw new Error('Incorrect doBlockObsolete1Count');
  if (doBlockObsolete2Count !== 1) throw new Error('Incorrect doBlockObsolete2Count');

  if (sql.includes('validate-ecf-certificate') || sql.includes('digital_menu') || sql.includes('factura')) {
    throw new Error('Contains excluded strings');
  }
}

describe('harden-registration-fiscal-rpcs migration', () => {
  const migrationPath = path.resolve(__dirname, '../migrations/20260715000003_harden-registration-fiscal-rpcs.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  it('validates the original migration perfectly', () => {
    expect(() => validateMigration(migrationSQL)).not.toThrow();
  });

  describe('Negative Mutation Tests (Guard Boundaries)', () => {
    it('fails if ECF membership clause is removed', () => {
      const mutated = migrationSQL.replace(/SELECT 1 FROM public\.tenant_users.*?activo = true/is, 'SELECT 1');
      expect(() => validateMigration(mutated)).toThrow(/cloudix_reserve_ecf missing membership query/);
    });

    it('fails if UPDATE is inserted before the guard', () => {
      const mutated = migrationSQL.replace(
        '-- Add authorization BEFORE any row lock/mutation',
        'UPDATE public.tenants SET activa = true;\n  -- Add authorization BEFORE any row lock/mutation'
      );
      expect(() => validateMigration(mutated)).toThrow(/contains mutation 'UPDATE public\.tenants' before guard completion/);
    });

    it('fails if auth.uid() fallback is present in the guard', () => {
      const mutated = migrationSQL.replace('v_auth_user_id uuid := public.cloudix_auth_user_id();', 'v_auth_user_id uuid := auth.uid();');
      expect(() => validateMigration(mutated)).toThrow(/missing auth user id assignment|fallback to auth\.uid\(\)/);
    });

    it('fails extraction if ECF closing terminator is missing', () => {
      const ecfOpen = migrationSQL.indexOf('cloudix_reserve_ecf');
      const ecfFirstTag = migrationSQL.indexOf('$function$', ecfOpen); 
      const ecfCloseTag = migrationSQL.indexOf('$function$', ecfFirstTag + 1); 
      const mutated = migrationSQL.slice(0, ecfCloseTag) + migrationSQL.slice(ecfCloseTag + 10);
      expect(() => validateMigration(mutated)).toThrow();
    });
  });

  describe('Negative Mutation Tests (Appended SQL / Strict Parser)', () => {
    it('fails if arbitrary SELECT is appended', () => {
      expect(() => validateMigration(migrationSQL + '\nSELECT 1;')).toThrow(/Unrecognized or un-allowed top-level statement/);
    });
    it('fails if TRUNCATE is appended', () => {
      expect(() => validateMigration(migrationSQL + '\nTRUNCATE public.tenants;')).toThrow(/Unrecognized or un-allowed top-level statement/);
    });
  });

  describe('Negative Mutation Tests (Strict DO Block Parsing)', () => {
    it('fails if IF is removed', () => {
      const mutated = migrationSQL.replace(/IF to_regprocedure/i, 'to_regprocedure');
      expect(() => validateMigration(mutated)).toThrow(/DO block structure invalid/);
    });

    it('fails if IS NOT NULL is changed', () => {
      const mutated = migrationSQL.replace(/IS NOT NULL/i, 'IS NULL');
      expect(() => validateMigration(mutated)).toThrow(/DO block structure invalid/);
    });

    it('fails if PERFORM is inserted', () => {
      const mutated = migrationSQL.replace(/EXECUTE 'REVOKE/i, "PERFORM 1; EXECUTE 'REVOKE");
      expect(() => validateMigration(mutated)).toThrow(/DO block structure invalid/);
    });

    it('fails if second EXECUTE is inserted', () => {
      const mutated = migrationSQL.replace(/authenticated;';/i, "authenticated;'; EXECUTE 'SELECT 1';");
      expect(() => validateMigration(mutated)).toThrow(/DO block structure invalid/);
    });

    it('fails if dollar tags mismatch', () => {
      const mutated = migrationSQL.replace(/END;\s*\$do\$;/i, 'END;\n$wrong$;');
      expect(() => validateMigration(mutated)).toThrow();
    });
  });
});