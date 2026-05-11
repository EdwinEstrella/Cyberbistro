-- ==========================================
-- ROLES Y FUNCIONES MOCK DE INSFORGE/SUPABASE
-- ==========================================
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'project_admin') THEN CREATE ROLE project_admin NOLOGIN; END IF; END $$;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO project_admin;

CREATE OR REPLACE FUNCTION cyberbistro_is_super_admin() RETURNS boolean AS $$ 
BEGIN RETURN COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_super_admin') = 'true', false); 
EXCEPTION WHEN OTHERS THEN RETURN false; 
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION cyberbistro_auth_user_id() RETURNS uuid AS $$ 
BEGIN RETURN (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid; 
EXCEPTION WHEN OTHERS THEN RETURN NULL; 
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION cyberbistro_auth_email() RETURNS text AS $$ 
BEGIN RETURN current_setting('request.jwt.claims', true)::jsonb ->> 'email'; 
EXCEPTION WHEN OTHERS THEN RETURN NULL; 
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION cyberbistro_current_admin_tenant_ids() RETURNS uuid[] AS $$ 
BEGIN RETURN ARRAY(SELECT jsonb_array_elements_text(current_setting('request.jwt.claims', true)::jsonb -> 'admin_tenant_ids')::uuid); 
EXCEPTION WHEN OTHERS THEN RETURN ARRAY[]::uuid[]; 
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION cloudix_auth_user_id() RETURNS uuid AS $$ 
BEGIN RETURN (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid; 
EXCEPTION WHEN OTHERS THEN RETURN NULL; 
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION cloudix_auth_email() RETURNS text AS $$ 
BEGIN RETURN current_setting('request.jwt.claims', true)::jsonb ->> 'email'; 
EXCEPTION WHEN OTHERS THEN RETURN NULL; 
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION cloudix_is_super_admin() RETURNS boolean AS $$ 
BEGIN RETURN COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_super_admin') = 'true', false); 
EXCEPTION WHEN OTHERS THEN RETURN false; 
END $$ LANGUAGE plpgsql STABLE;

-- Trigger functions required by schema
CREATE OR REPLACE FUNCTION realtime_notify_cocina_estado() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION realtime_notify_comandas() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;

