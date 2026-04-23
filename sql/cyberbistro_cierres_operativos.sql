-- Tabla para registrar cierres operativos por tenant y por dia de operacion.
-- Ejecutar una vez en el SQL editor de InsForge antes de usar la nueva pantalla de cierre.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.cierres_operativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_day date NOT NULL,
  cycle_number integer NOT NULL CHECK (cycle_number > 0),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  printed_at timestamptz NULL,
  opened_by_auth_user_id uuid NULL,
  closed_by_auth_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cierres_operativos_closed_after_open CHECK (closed_at IS NULL OR closed_at >= opened_at),
  CONSTRAINT cierres_operativos_printed_after_open CHECK (printed_at IS NULL OR printed_at >= opened_at)
);

ALTER TABLE public.cierres_operativos
  DROP CONSTRAINT IF EXISTS cierres_operativos_unique_cycle;

DROP INDEX IF EXISTS public.cierres_operativos_unique_cycle;

CREATE UNIQUE INDEX IF NOT EXISTS cierres_operativos_unique_cycle
  ON public.cierres_operativos (tenant_id, cycle_number);

CREATE INDEX IF NOT EXISTS cierres_operativos_tenant_day_idx
  ON public.cierres_operativos (tenant_id, business_day, cycle_number DESC);

CREATE INDEX IF NOT EXISTS cierres_operativos_tenant_cycle_idx
  ON public.cierres_operativos (tenant_id, cycle_number DESC);

CREATE INDEX IF NOT EXISTS cierres_operativos_open_idx
  ON public.cierres_operativos (tenant_id, business_day)
  WHERE closed_at IS NULL;

ALTER TABLE public.cierres_operativos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_cierres_operativos_tenant_isolation ON public.cierres_operativos;

CREATE POLICY cb_cierres_operativos_tenant_isolation
ON public.cierres_operativos
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = cierres_operativos.tenant_id
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cyberbistro_auth_user_id()
        OR (
          tu.auth_user_id IS NULL
          AND lower(tu.email) = lower(public.cyberbistro_auth_email())
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = cierres_operativos.tenant_id
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cyberbistro_auth_user_id()
        OR (
          tu.auth_user_id IS NULL
          AND lower(tu.email) = lower(public.cyberbistro_auth_email())
        )
      )
  )
);
