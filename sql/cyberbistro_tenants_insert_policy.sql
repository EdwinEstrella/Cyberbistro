-- Allow authenticated users to create a new tenant (used during registration)
DROP POLICY IF EXISTS cb_tenants_auth_insert ON public.tenants;

CREATE POLICY cb_tenants_auth_insert
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (true);
