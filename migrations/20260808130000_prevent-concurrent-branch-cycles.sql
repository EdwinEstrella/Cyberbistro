-- A branch may have only one cash cycle open at a time. A trigger is used
-- because legacy data may already contain duplicate open cycles.
CREATE OR REPLACE FUNCTION public.prevent_concurrent_open_cycles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.closed_at IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      NEW.tenant_id::text || ':' || COALESCE(NEW.sucursal_id::text, ''),
      0
    ));

    IF EXISTS (
      SELECT 1
      FROM public.cierres_operativos AS existing_cycle
      WHERE existing_cycle.tenant_id = NEW.tenant_id
        AND existing_cycle.sucursal_id IS NOT DISTINCT FROM NEW.sucursal_id
        AND existing_cycle.closed_at IS NULL
        AND existing_cycle.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Ya existe un ciclo operativo abierto para esta sucursal.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_concurrent_open_cycles ON public.cierres_operativos;
CREATE TRIGGER prevent_concurrent_open_cycles
  BEFORE INSERT OR UPDATE OF tenant_id, sucursal_id, closed_at
  ON public.cierres_operativos
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_concurrent_open_cycles();
