-- e-NCF authorized range bounds per e-CF type, e.g. {"E31": {"start": 1, "end": 1000}}.
-- The next number stays in ncf_secuencias_por_tipo (read and incremented by the POS and by
-- cloudix_reserve_ecf, which casts it to integer), so this column is purely additive.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ecf_secuencias_rangos jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tenants.ecf_secuencias_rangos IS
  'Authorized e-NCF range bounds per type: {"E31": {"start": int, "end": int}}. Next number lives in ncf_secuencias_por_tipo.';
