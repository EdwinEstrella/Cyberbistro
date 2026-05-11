const fs = require('fs');
const path = require('path');

// Ahora este script vive dentro de 'test/', por ende '..' apunta a la raíz del proyecto
const esquemaPath = path.join(__dirname, '..', 'esquema', 'esquema.txt');
const politicasPath = path.join(__dirname, '..', 'esquema', 'politicas.txt');

const schemaData = JSON.parse(fs.readFileSync(esquemaPath, 'utf8'));
const politicasData = JSON.parse(fs.readFileSync(politicasPath, 'utf8'));

const tables = {};
schemaData.forEach(row => {
    if (!tables[row.table_name]) {
        tables[row.table_name] = [];
    }
    tables[row.table_name].push(row);
});

let sql = '-- Archivo autogenerado para pruebas en CI/CD con RLS\n';
sql += 'CREATE EXTENSION IF NOT EXISTS "pgcrypto";\n\n';

sql += `-- ==========================================\n`;
sql += `-- ROLES (Emulando PostgREST de InsForge)\n`;
sql += `-- ==========================================\n`;
sql += `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;\n`;
sql += `GRANT USAGE ON SCHEMA public TO authenticated;\n\n`;

sql += `-- ==========================================\n`;
sql += `-- FUNCIONES DE AUTENTICACIÓN SIMULADAS\n`;
sql += `-- ==========================================\n`;
sql += `CREATE OR REPLACE FUNCTION cyberbistro_is_super_admin() RETURNS boolean AS $$ BEGIN RETURN current_setting('request.jwt.claims', true)::jsonb ->> 'is_super_admin' = 'true'; EXCEPTION WHEN OTHERS THEN RETURN false; END $$ LANGUAGE plpgsql STABLE;\n`;
sql += `CREATE OR REPLACE FUNCTION cyberbistro_auth_user_id() RETURNS uuid AS $$ BEGIN RETURN (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid; EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$ LANGUAGE plpgsql STABLE;\n`;
sql += `CREATE OR REPLACE FUNCTION cyberbistro_auth_email() RETURNS text AS $$ BEGIN RETURN current_setting('request.jwt.claims', true)::jsonb ->> 'email'; EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$ LANGUAGE plpgsql STABLE;\n`;
sql += `CREATE OR REPLACE FUNCTION cyberbistro_current_admin_tenant_ids() RETURNS uuid[] AS $$ BEGIN RETURN ARRAY(SELECT jsonb_array_elements_text(current_setting('request.jwt.claims', true)::jsonb -> 'admin_tenant_ids')::uuid); EXCEPTION WHEN OTHERS THEN RETURN ARRAY[]::uuid[]; END $$ LANGUAGE plpgsql STABLE;\n`;
sql += `CREATE OR REPLACE FUNCTION cloudix_auth_user_id() RETURNS uuid AS $$ BEGIN RETURN cyberbistro_auth_user_id(); END $$ LANGUAGE plpgsql STABLE;\n`;
sql += `CREATE OR REPLACE FUNCTION cloudix_auth_email() RETURNS text AS $$ BEGIN RETURN cyberbistro_auth_email(); END $$ LANGUAGE plpgsql STABLE;\n`;
sql += `CREATE OR REPLACE FUNCTION cloudix_is_super_admin() RETURNS boolean AS $$ BEGIN RETURN cyberbistro_is_super_admin(); END $$ LANGUAGE plpgsql STABLE;\n\n`;

sql += `-- ==========================================\n`;
sql += `-- TABLAS\n`;
sql += `-- ==========================================\n`;
for (const tableName in tables) {
    sql += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
    const columns = tables[tableName].map(col => {
        let definition = `  ${col.column_name} ${col.data_type}`;
        if (col.column_name === 'id') {
            definition += ' PRIMARY KEY';
            if (col.data_type === 'uuid') {
                definition += ' DEFAULT gen_random_uuid()';
            }
        }
        return definition;
    });
    sql += columns.join(',\n');
    sql += '\n);\n\n';
}

sql += `-- ==========================================\n`;
sql += `-- ROW LEVEL SECURITY (RLS)\n`;
sql += `-- ==========================================\n`;

const tablesWithRls = new Set(politicasData.map(p => p.tablename));
tablesWithRls.forEach(tableName => {
    sql += `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;\n`;
    sql += `ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;\n`;
});

politicasData.forEach(pol => {
    sql += `CREATE POLICY "${pol.policyname}" ON ${pol.tablename}\n`;
    sql += `  AS ${pol.permissive}\n`;
    sql += `  FOR ${pol.cmd}\n`;
    
    let roles = pol.roles.replace(/[{}]/g, '');
    if (roles !== 'public') {
        sql += `  TO ${roles}\n`;
    }
    
    if (pol.qual) {
        sql += `  USING (${pol.qual})\n`;
    }
    if (pol.with_check) {
        sql += `  WITH CHECK (${pol.with_check})\n`;
    }
    sql += ';\n\n';
});

sql += `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;\n`;
sql += `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;\n`;

// El output ahora es directamente dentro del mismo directorio 'test'
const outPath = path.join(__dirname, 'schema.sql');
fs.writeFileSync(outPath, sql);

console.log(`Esquema SQL + RLS generado exitosamente en ${outPath}`);
