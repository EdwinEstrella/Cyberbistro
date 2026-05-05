-- Migra las secuencias NCF B a columnas separadas por tenant
-- y agrega la preferencia persistente del switch ITBIS.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS itbis_cobro_por_defecto boolean;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ncf_b01_secuencia_siguiente integer;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ncf_b02_secuencia_siguiente integer;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ncf_b14_secuencia_siguiente integer;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ncf_b15_secuencia_siguiente integer;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ncf_b16_secuencia_siguiente integer;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ncf_b17_secuencia_siguiente integer;

UPDATE public.tenants t
SET
  itbis_cobro_por_defecto = coalesce(t.itbis_cobro_por_defecto, false),
  ncf_b01_secuencia_siguiente = greatest(
    coalesce(
      t.ncf_b01_secuencia_siguiente,
      (coalesce(t.ncf_secuencias_por_tipo, '{}'::jsonb) ->> 'B01')::integer,
      CASE
        WHEN upper(coalesce(t.ncf_tipo_default, '')) = 'B01' AND t.ncf_secuencia_siguiente >= 1
          THEN t.ncf_secuencia_siguiente
        ELSE null
      END,
      1
    ),
    1
  ),
  ncf_b02_secuencia_siguiente = greatest(
    coalesce(
      t.ncf_b02_secuencia_siguiente,
      (coalesce(t.ncf_secuencias_por_tipo, '{}'::jsonb) ->> 'B02')::integer,
      CASE
        WHEN upper(coalesce(t.ncf_tipo_default, '')) = 'B02' AND t.ncf_secuencia_siguiente >= 1
          THEN t.ncf_secuencia_siguiente
        ELSE null
      END,
      1
    ),
    1
  ),
  ncf_b14_secuencia_siguiente = greatest(
    coalesce(
      t.ncf_b14_secuencia_siguiente,
      (coalesce(t.ncf_secuencias_por_tipo, '{}'::jsonb) ->> 'B14')::integer,
      CASE
        WHEN upper(coalesce(t.ncf_tipo_default, '')) = 'B14' AND t.ncf_secuencia_siguiente >= 1
          THEN t.ncf_secuencia_siguiente
        ELSE null
      END,
      1
    ),
    1
  ),
  ncf_b15_secuencia_siguiente = greatest(
    coalesce(
      t.ncf_b15_secuencia_siguiente,
      (coalesce(t.ncf_secuencias_por_tipo, '{}'::jsonb) ->> 'B15')::integer,
      CASE
        WHEN upper(coalesce(t.ncf_tipo_default, '')) = 'B15' AND t.ncf_secuencia_siguiente >= 1
          THEN t.ncf_secuencia_siguiente
        ELSE null
      END,
      1
    ),
    1
  ),
  ncf_b16_secuencia_siguiente = greatest(
    coalesce(
      t.ncf_b16_secuencia_siguiente,
      (coalesce(t.ncf_secuencias_por_tipo, '{}'::jsonb) ->> 'B16')::integer,
      CASE
        WHEN upper(coalesce(t.ncf_tipo_default, '')) = 'B16' AND t.ncf_secuencia_siguiente >= 1
          THEN t.ncf_secuencia_siguiente
        ELSE null
      END,
      1
    ),
    1
  ),
  ncf_b17_secuencia_siguiente = greatest(
    coalesce(
      t.ncf_b17_secuencia_siguiente,
      (coalesce(t.ncf_secuencias_por_tipo, '{}'::jsonb) ->> 'B17')::integer,
      CASE
        WHEN upper(coalesce(t.ncf_tipo_default, '')) = 'B17' AND t.ncf_secuencia_siguiente >= 1
          THEN t.ncf_secuencia_siguiente
        ELSE null
      END,
      1
    ),
    1
  );

ALTER TABLE public.tenants
  ALTER COLUMN itbis_cobro_por_defecto SET DEFAULT false;

ALTER TABLE public.tenants
  ALTER COLUMN itbis_cobro_por_defecto SET NOT NULL;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_b01_secuencia_siguiente SET DEFAULT 1;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_b02_secuencia_siguiente SET DEFAULT 1;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_b14_secuencia_siguiente SET DEFAULT 1;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_b15_secuencia_siguiente SET DEFAULT 1;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_b16_secuencia_siguiente SET DEFAULT 1;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_b17_secuencia_siguiente SET DEFAULT 1;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_b01_secuencia_siguiente SET NOT NULL;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_b02_secuencia_siguiente SET NOT NULL;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_b14_secuencia_siguiente SET NOT NULL;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_b15_secuencia_siguiente SET NOT NULL;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_b16_secuencia_siguiente SET NOT NULL;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_b17_secuencia_siguiente SET NOT NULL;

UPDATE public.tenants
SET
  ncf_secuencias_por_tipo = jsonb_build_object(
    'B01', ncf_b01_secuencia_siguiente,
    'B02', ncf_b02_secuencia_siguiente,
    'B14', ncf_b14_secuencia_siguiente,
    'B15', ncf_b15_secuencia_siguiente,
    'B16', ncf_b16_secuencia_siguiente,
    'B17', ncf_b17_secuencia_siguiente
  ),
  ncf_secuencia_siguiente = CASE upper(coalesce(ncf_tipo_default, 'B01'))
    WHEN 'B01' THEN ncf_b01_secuencia_siguiente
    WHEN 'B02' THEN ncf_b02_secuencia_siguiente
    WHEN 'B14' THEN ncf_b14_secuencia_siguiente
    WHEN 'B15' THEN ncf_b15_secuencia_siguiente
    WHEN 'B16' THEN ncf_b16_secuencia_siguiente
    WHEN 'B17' THEN ncf_b17_secuencia_siguiente
    ELSE greatest(coalesce(ncf_secuencia_siguiente, 1), 1)
  END;
