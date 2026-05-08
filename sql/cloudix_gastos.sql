CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.gasto_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text NULL,
  color text NOT NULL DEFAULT '#ff906d',
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gasto_categorias_nombre_not_blank CHECK (length(trim(nombre)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS gasto_categorias_tenant_nombre_unique
  ON public.gasto_categorias (tenant_id, lower(trim(nombre)));

CREATE INDEX IF NOT EXISTS gasto_categorias_tenant_idx
  ON public.gasto_categorias (tenant_id, activa, nombre);

CREATE TABLE IF NOT EXISTS public.gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id uuid NULL REFERENCES public.gasto_categorias(id) ON DELETE SET NULL,
  cycle_id uuid NULL REFERENCES public.cierres_operativos(id) ON DELETE SET NULL,
  descripcion text NOT NULL,
  proveedor text NULL,
  monto numeric(12,2) NOT NULL,
  metodo_pago text NULL,
  fecha_gasto timestamptz NOT NULL DEFAULT now(),
  notas text NULL,
  created_by_auth_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gastos_descripcion_not_blank CHECK (length(trim(descripcion)) > 0),
  CONSTRAINT gastos_monto_positive CHECK (monto > 0)
);

CREATE INDEX IF NOT EXISTS gastos_tenant_fecha_idx
  ON public.gastos (tenant_id, fecha_gasto DESC);

CREATE INDEX IF NOT EXISTS gastos_tenant_cycle_idx
  ON public.gastos (tenant_id, cycle_id);

CREATE INDEX IF NOT EXISTS gastos_tenant_category_idx
  ON public.gastos (tenant_id, category_id);

ALTER TABLE public.gasto_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_gasto_categorias_tenant_isolation ON public.gasto_categorias;
CREATE POLICY cb_gasto_categorias_tenant_isolation
ON public.gasto_categorias
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = gasto_categorias.tenant_id
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cloudix_auth_user_id()
        OR (
          tu.auth_user_id IS NULL
          AND lower(tu.email) = lower(public.cloudix_auth_email())
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = gasto_categorias.tenant_id
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cloudix_auth_user_id()
        OR (
          tu.auth_user_id IS NULL
          AND lower(tu.email) = lower(public.cloudix_auth_email())
        )
      )
  )
);

DROP POLICY IF EXISTS cb_gastos_tenant_isolation ON public.gastos;
CREATE POLICY cb_gastos_tenant_isolation
ON public.gastos
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = gastos.tenant_id
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cloudix_auth_user_id()
        OR (
          tu.auth_user_id IS NULL
          AND lower(tu.email) = lower(public.cloudix_auth_email())
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = gastos.tenant_id
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cloudix_auth_user_id()
        OR (
          tu.auth_user_id IS NULL
          AND lower(tu.email) = lower(public.cloudix_auth_email())
        )
      )
  )
);
