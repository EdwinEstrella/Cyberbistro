-- Fast per-tenant row counts for the sync health monitor.
--
-- Problem: the "Local vs. Nube por tabla" monitor counted each cloud table with
-- PostgREST `count=exact`. On `facturas` (thousands of rows) that scan evaluates
-- the OR-combined RLS SELECT policies per row, and two of them call
-- `cyberbistro_has_tenant_role(tenant_id, ...)` — a SECURITY DEFINER function that
-- cannot be hoisted because its argument is a column. ~1.2s per policy per 5.7k
-- rows crossed the authenticated `statement_timeout` (8s), so the count returned
-- an error and the monitor showed "error" / could not verify the download side.
--
-- Fix: a single SECURITY DEFINER RPC that authorizes the caller against the tenant
-- ONCE, then counts each comparable table through the plain tenant index (no
-- per-row RLS). One round trip, milliseconds instead of seconds.

create or replace function public.cloudix_tenant_table_counts(p_tenant_id uuid)
returns table(tabla text, total bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_tenant_id is null then
    raise exception 'p_tenant_id is required' using errcode = '22004';
  end if;

  -- Authorize once: caller must be a super admin or an active member of the tenant.
  -- Mirrors the cb_*_select policies (cloudix auth helpers) without paying their
  -- per-row cost.
  if not (
    public.cyberbistro_is_super_admin()
    or exists (
      select 1
      from public.tenant_users tu
      where tu.tenant_id = p_tenant_id
        and tu.activo is true
        and (
          tu.auth_user_id = public.cloudix_auth_user_id()
          or (
            tu.auth_user_id is null
            and lower(tu.email) = lower(coalesce(public.cloudix_auth_email(), ''))
          )
        )
    )
  ) then
    raise exception 'not authorized for tenant %', p_tenant_id using errcode = '42501';
  end if;

  return query
  select 'cierres_operativos'::text, count(*) from public.cierres_operativos where tenant_id = p_tenant_id
  union all select 'facturas',       count(*) from public.facturas          where tenant_id = p_tenant_id
  union all select 'gastos',         count(*) from public.gastos            where tenant_id = p_tenant_id
  union all select 'gasto_categorias', count(*) from public.gasto_categorias where tenant_id = p_tenant_id
  union all select 'customers',      count(*) from public.customers         where tenant_id = p_tenant_id
  union all select 'cuentas_cobrar', count(*) from public.cuentas_cobrar    where tenant_id = p_tenant_id
  union all select 'cxc_pagos',      count(*) from public.cxc_pagos         where tenant_id = p_tenant_id
  union all select 'cuentas_pagar',  count(*) from public.cuentas_pagar     where tenant_id = p_tenant_id
  union all select 'cxp_pagos',      count(*) from public.cxp_pagos         where tenant_id = p_tenant_id
  union all select 'compras',        count(*) from public.compras           where tenant_id = p_tenant_id;
end;
$$;

revoke all on function public.cloudix_tenant_table_counts(uuid) from public, anon;
grant execute on function public.cloudix_tenant_table_counts(uuid) to authenticated;

comment on function public.cloudix_tenant_table_counts(uuid) is
  'Sync monitor helper: authorized-once per-tenant row counts for the local-vs-cloud comparison. Avoids per-row RLS cost that timed out exact counts on large tables.';
