create table if not exists public.customers (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  document_id text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists customers_tenant_active_name_idx
  on public.customers (tenant_id, lower(name))
  where deleted_at is null;

create index if not exists customers_tenant_phone_idx
  on public.customers (tenant_id, phone)
  where phone is not null and deleted_at is null;

create index if not exists customers_tenant_document_idx
  on public.customers (tenant_id, document_id)
  where document_id is not null and deleted_at is null;

alter table public.facturas
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists facturas_tenant_customer_idx
  on public.facturas (tenant_id, customer_id, created_at desc)
  where customer_id is not null;

alter table public.customers enable row level security;

drop policy if exists cb_customers_tenant_select on public.customers;
drop policy if exists cb_customers_tenant_insert on public.customers;
drop policy if exists cb_customers_tenant_update on public.customers;
drop policy if exists cb_customers_tenant_delete on public.customers;

create policy cb_customers_tenant_select
  on public.customers
  for select
  using (
    cyberbistro_has_tenant_role(
      tenant_id,
      array['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']
    )
  );

create policy cb_customers_tenant_insert
  on public.customers
  for insert
  with check (
    cyberbistro_has_tenant_role(
      tenant_id,
      array['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']
    )
  );

create policy cb_customers_tenant_update
  on public.customers
  for update
  using (
    cyberbistro_has_tenant_role(
      tenant_id,
      array['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']
    )
  )
  with check (
    cyberbistro_has_tenant_role(
      tenant_id,
      array['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']
    )
  );

create policy cb_customers_tenant_delete
  on public.customers
  for delete
  using (
    cyberbistro_has_tenant_role(
      tenant_id,
      array['admin']
    )
  );
