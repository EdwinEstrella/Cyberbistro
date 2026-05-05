-- Agrega una configuracion de secuencias NCF por tipo dentro del tenant.
-- Mantiene la compatibilidad con `ncf_tipo_default` y espeja en `ncf_secuencia_siguiente`
-- la secuencia correspondiente al tipo por defecto.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ncf_secuencias_por_tipo jsonb;

ALTER TABLE public.tenants
  ALTER COLUMN ncf_secuencias_por_tipo SET DEFAULT '{}'::jsonb;

UPDATE public.tenants t
SET ncf_secuencias_por_tipo = jsonb_build_object(
  'B01',
  coalesce(
    CASE
      WHEN upper(coalesce(t.ncf_tipo_default, '')) = 'B01' AND t.ncf_secuencia_siguiente >= 1
        THEN t.ncf_secuencia_siguiente
      ELSE null
    END,
    (coalesce(t.ncf_secuencias_por_tipo, '{}'::jsonb) ->> 'B01')::integer,
    1
  ),
  'B02',
  coalesce(
    CASE
      WHEN upper(coalesce(t.ncf_tipo_default, '')) = 'B02' AND t.ncf_secuencia_siguiente >= 1
        THEN t.ncf_secuencia_siguiente
      ELSE null
    END,
    (coalesce(t.ncf_secuencias_por_tipo, '{}'::jsonb) ->> 'B02')::integer,
    1
  ),
  'B14',
  coalesce(
    CASE
      WHEN upper(coalesce(t.ncf_tipo_default, '')) = 'B14' AND t.ncf_secuencia_siguiente >= 1
        THEN t.ncf_secuencia_siguiente
      ELSE null
    END,
    (coalesce(t.ncf_secuencias_por_tipo, '{}'::jsonb) ->> 'B14')::integer,
    1
  ),
  'B15',
  coalesce(
    CASE
      WHEN upper(coalesce(t.ncf_tipo_default, '')) = 'B15' AND t.ncf_secuencia_siguiente >= 1
        THEN t.ncf_secuencia_siguiente
      ELSE null
    END,
    (coalesce(t.ncf_secuencias_por_tipo, '{}'::jsonb) ->> 'B15')::integer,
    1
  ),
  'B16',
  coalesce(
    CASE
      WHEN upper(coalesce(t.ncf_tipo_default, '')) = 'B16' AND t.ncf_secuencia_siguiente >= 1
        THEN t.ncf_secuencia_siguiente
      ELSE null
    END,
    (coalesce(t.ncf_secuencias_por_tipo, '{}'::jsonb) ->> 'B16')::integer,
    1
  ),
  'B17',
  coalesce(
    CASE
      WHEN upper(coalesce(t.ncf_tipo_default, '')) = 'B17' AND t.ncf_secuencia_siguiente >= 1
        THEN t.ncf_secuencia_siguiente
      ELSE null
    END,
    (coalesce(t.ncf_secuencias_por_tipo, '{}'::jsonb) ->> 'B17')::integer,
    1
  )
);

UPDATE public.tenants
SET ncf_secuencia_siguiente = greatest(
  coalesce(
    (
      coalesce(ncf_secuencias_por_tipo, '{}'::jsonb) ->>
      upper(coalesce(ncf_tipo_default, 'B01'))
    )::integer,
    ncf_secuencia_siguiente,
    1
  ),
  1
)
WHERE upper(coalesce(ncf_tipo_default, 'B01')) ~ '^B[0-9]{2}$';
