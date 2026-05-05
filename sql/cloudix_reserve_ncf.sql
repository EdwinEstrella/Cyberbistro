-- Ejecutar en el SQL editor de InsForge (o via MCP run-raw-sql) una vez por backend.
-- Reserva el NCF del tipo pedido y avanza solo su columna de secuencia.
-- Requiere `sql/cloudix_tenant_ncf_columnas_itbis.sql`.

DROP FUNCTION IF EXISTS public.cloudix_reserve_ncf(uuid);
DROP FUNCTION IF EXISTS public.cloudix_reserve_ncf(uuid, text);

CREATE OR REPLACE FUNCTION public.cloudix_reserve_ncf(
  p_tenant_id uuid,
  p_ncf_tipo text DEFAULT null
)
RETURNS TABLE (
  ncf_fiscal_activo boolean,
  ncf_tipo_codigo text,
  seq_reserved integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH tenant_target AS (
    SELECT
      t.id,
      CASE
        WHEN upper(coalesce(t.ncf_tipo_default, 'B01')) IN ('B01', 'B02', 'B14', 'B15', 'B16', 'B17')
          THEN upper(coalesce(t.ncf_tipo_default, 'B01'))
        ELSE 'B01'
      END AS tipo_default_codigo,
      CASE
        WHEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01')) IN ('B01', 'B02', 'B14', 'B15', 'B16', 'B17')
          THEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01'))
        ELSE 'B01'
      END AS tipo_codigo,
      CASE
        WHEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01')) = 'B02'
          THEN greatest(coalesce(t.ncf_b02_secuencia_siguiente, 1), 1)
        WHEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01')) = 'B14'
          THEN greatest(coalesce(t.ncf_b14_secuencia_siguiente, 1), 1)
        WHEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01')) = 'B15'
          THEN greatest(coalesce(t.ncf_b15_secuencia_siguiente, 1), 1)
        WHEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01')) = 'B16'
          THEN greatest(coalesce(t.ncf_b16_secuencia_siguiente, 1), 1)
        WHEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01')) = 'B17'
          THEN greatest(coalesce(t.ncf_b17_secuencia_siguiente, 1), 1)
        ELSE greatest(coalesce(t.ncf_b01_secuencia_siguiente, 1), 1)
      END AS seq_actual
    FROM public.tenants t
    WHERE
      t.id = p_tenant_id
      AND t.ncf_fiscal_activo IS TRUE
    FOR UPDATE
  )
  UPDATE public.tenants t
  SET
    ncf_b01_secuencia_siguiente = CASE
      WHEN tenant_target.tipo_codigo = 'B01' THEN tenant_target.seq_actual + 1
      ELSE t.ncf_b01_secuencia_siguiente
    END,
    ncf_b02_secuencia_siguiente = CASE
      WHEN tenant_target.tipo_codigo = 'B02' THEN tenant_target.seq_actual + 1
      ELSE t.ncf_b02_secuencia_siguiente
    END,
    ncf_b14_secuencia_siguiente = CASE
      WHEN tenant_target.tipo_codigo = 'B14' THEN tenant_target.seq_actual + 1
      ELSE t.ncf_b14_secuencia_siguiente
    END,
    ncf_b15_secuencia_siguiente = CASE
      WHEN tenant_target.tipo_codigo = 'B15' THEN tenant_target.seq_actual + 1
      ELSE t.ncf_b15_secuencia_siguiente
    END,
    ncf_b16_secuencia_siguiente = CASE
      WHEN tenant_target.tipo_codigo = 'B16' THEN tenant_target.seq_actual + 1
      ELSE t.ncf_b16_secuencia_siguiente
    END,
    ncf_b17_secuencia_siguiente = CASE
      WHEN tenant_target.tipo_codigo = 'B17' THEN tenant_target.seq_actual + 1
      ELSE t.ncf_b17_secuencia_siguiente
    END,
    ncf_secuencias_por_tipo = jsonb_build_object(
      'B01', CASE
        WHEN tenant_target.tipo_codigo = 'B01' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b01_secuencia_siguiente
      END,
      'B02', CASE
        WHEN tenant_target.tipo_codigo = 'B02' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b02_secuencia_siguiente
      END,
      'B14', CASE
        WHEN tenant_target.tipo_codigo = 'B14' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b14_secuencia_siguiente
      END,
      'B15', CASE
        WHEN tenant_target.tipo_codigo = 'B15' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b15_secuencia_siguiente
      END,
      'B16', CASE
        WHEN tenant_target.tipo_codigo = 'B16' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b16_secuencia_siguiente
      END,
      'B17', CASE
        WHEN tenant_target.tipo_codigo = 'B17' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b17_secuencia_siguiente
      END
    ),
    ncf_secuencia_siguiente = CASE tenant_target.tipo_default_codigo
      WHEN 'B01' THEN CASE
        WHEN tenant_target.tipo_codigo = 'B01' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b01_secuencia_siguiente
      END
      WHEN 'B02' THEN CASE
        WHEN tenant_target.tipo_codigo = 'B02' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b02_secuencia_siguiente
      END
      WHEN 'B14' THEN CASE
        WHEN tenant_target.tipo_codigo = 'B14' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b14_secuencia_siguiente
      END
      WHEN 'B15' THEN CASE
        WHEN tenant_target.tipo_codigo = 'B15' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b15_secuencia_siguiente
      END
      WHEN 'B16' THEN CASE
        WHEN tenant_target.tipo_codigo = 'B16' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b16_secuencia_siguiente
      END
      WHEN 'B17' THEN CASE
        WHEN tenant_target.tipo_codigo = 'B17' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b17_secuencia_siguiente
      END
      ELSE greatest(coalesce(t.ncf_secuencia_siguiente, 1), 1)
    END,
    updated_at = now()
  FROM tenant_target
  WHERE t.id = tenant_target.id
  RETURNING
    TRUE,
    tenant_target.tipo_codigo,
    tenant_target.seq_actual;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cloudix_reserve_ncf(uuid, text) TO authenticated;
