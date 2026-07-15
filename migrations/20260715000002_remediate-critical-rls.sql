-- remediate-critical-rls.sql

ALTER FUNCTION public.cyberbistro_is_super_admin() SECURITY DEFINER;
ALTER FUNCTION public.cyberbistro_is_super_admin() SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.cloudix_is_super_admin() SECURITY DEFINER;
ALTER FUNCTION public.cloudix_is_super_admin() SET search_path = pg_catalog, public, pg_temp;

ALTER TABLE public.measurement_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cyberbistro_super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloudix_super_admins ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.measurement_units FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payments FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.permission_catalog FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.cyberbistro_super_admins FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.cloudix_super_admins FROM anon, authenticated;
