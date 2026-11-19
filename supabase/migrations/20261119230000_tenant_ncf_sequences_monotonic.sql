-- Migration: 20261119230000_tenant_ncf_sequences_monotonic.sql
-- Description: Enforce monotonic progression of e-NCF sequence counters on tenants.
--
-- Why it exists:
-- On 2026-11-19 in production, an Ajustes (settings) save from a desktop client
-- carrying a stale local mirror snapshot overwrote tenants.ncf_secuencias_por_tipo,
-- resetting an active e-CF counter (E32 from 108 back to 8). This caused the next
-- emitted invoice to reuse an e-NCF that DGII rejected with error [75] ("e-NCF ya utilizado").
--
-- Defense in depth:
-- While client settings save payloads no longer write ncf_secuencias_por_tipo, this BEFORE UPDATE
-- trigger ensures that e-NCF counters (^E[0-9]{2}$) can never regress, be omitted, or be replaced
-- with invalid values during an update of ncf_secuencias_por_tipo.
--
-- Rules:
-- 1. For each E key present in OLD.ncf_secuencias_por_tipo with a numeric value:
--    - If NEW lacks the key, or NEW's value is not a number, or NEW's value is lower,
--      clamp NEW's value to OLD's value.
--    - Higher values pass through.
-- 2. Non-E keys (e.g. B-series) are untouched.
-- 3. Silently clamp (do NOT raise): a raise would wedge desktop sync outboxes on an otherwise valid update.
-- 4. Handle NULL OLD/NEW maps gracefully with coalesce(..., '{}'::jsonb).

CREATE OR REPLACE FUNCTION public.cloudix_tenants_ncf_sequences_monotonic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_old_map jsonb;
  v_new_map jsonb;
  v_key text;
  v_old_val jsonb;
  v_new_val jsonb;
  v_old_num numeric;
  v_new_num numeric;
BEGIN
  v_old_map := coalesce(OLD.ncf_secuencias_por_tipo, '{}'::jsonb);
  IF jsonb_typeof(v_old_map) <> 'object' THEN
    RETURN NEW;
  END IF;

  v_new_map := coalesce(NEW.ncf_secuencias_por_tipo, '{}'::jsonb);
  IF jsonb_typeof(v_new_map) <> 'object' THEN
    v_new_map := '{}'::jsonb;
  END IF;

  FOR v_key, v_old_val IN
    SELECT key, value FROM jsonb_each(v_old_map)
  LOOP
    -- Only enforce monotonicity on E-type counters (keys matching ^E[0-9]{2}$)
    IF v_key ~ '^E[0-9]{2}$' AND jsonb_typeof(v_old_val) = 'number' THEN
      v_old_num := (v_old_map ->> v_key)::numeric;
      v_new_val := v_new_map -> v_key;

      -- If NEW lacks the key, or NEW's value is not a number, or NEW's value is lower, set to OLD value
      IF v_new_val IS NULL OR jsonb_typeof(v_new_val) <> 'number' THEN
        v_new_map := jsonb_set(v_new_map, ARRAY[v_key], v_old_val, true);
      ELSE
        v_new_num := (v_new_map ->> v_key)::numeric;
        IF v_new_num < v_old_num THEN
          v_new_map := jsonb_set(v_new_map, ARRAY[v_key], v_old_val, true);
        END IF;
      END IF;
    END IF;
  END LOOP;

  NEW.ncf_secuencias_por_tipo := v_new_map;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.cloudix_tenants_ncf_sequences_monotonic() IS
  'Guards tenants.ncf_secuencias_por_tipo so that e-NCF counters (^E[0-9]{2}$) can never regress, be cleared, or overwritten with lower values.';

DROP TRIGGER IF EXISTS tenants_ncf_sequences_monotonic ON public.tenants;

CREATE TRIGGER tenants_ncf_sequences_monotonic
  BEFORE UPDATE OF ncf_secuencias_por_tipo ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.cloudix_tenants_ncf_sequences_monotonic();
