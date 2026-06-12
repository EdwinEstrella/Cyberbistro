CREATE OR REPLACE FUNCTION public.notify_digital_menu_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
  ELSE
    v_tenant_id := NEW.tenant_id;
  END IF;

  -- Publish a custom realtime event to the "digital_menu" channel
  PERFORM realtime.publish(
    'digital_menu:' || v_tenant_id::text,
    'menu_changed',
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP
    )
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_platos_digital_menu ON public.platos;
CREATE TRIGGER trg_notify_platos_digital_menu
  AFTER INSERT OR UPDATE OR DELETE ON public.platos
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_digital_menu_update();

DROP TRIGGER IF EXISTS trg_notify_digital_menu_items ON public.digital_menu_items;
CREATE TRIGGER trg_notify_digital_menu_items
  AFTER INSERT OR UPDATE OR DELETE ON public.digital_menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_digital_menu_update();

DROP TRIGGER IF EXISTS trg_notify_digital_menu_settings ON public.digital_menu_settings;
CREATE TRIGGER trg_notify_digital_menu_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.digital_menu_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_digital_menu_update();
