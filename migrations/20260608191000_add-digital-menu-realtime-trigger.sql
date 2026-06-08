-- Add realtime notify triggers for digital_orders on cocina channel

CREATE OR REPLACE FUNCTION public.realtime_notify_digital_orders()
RETURNS trigger AS $$
DECLARE
  tid uuid;
BEGIN
  tid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF TG_OP = 'DELETE' THEN
    PERFORM realtime.publish(
      'cocina:' || tid::text,
      'DELETE_digital_order',
      jsonb_build_object('id', OLD.id::text, 'tenant_id', tid::text)
    );
    RETURN OLD;
  END IF;
  PERFORM realtime.publish(
    'cocina:' || tid::text,
    TG_OP || '_digital_order',
    jsonb_build_object(
      'id', NEW.id::text,
      'tenant_id', tid::text,
      'status', NEW.status,
      'customer_name', NEW.customer_name
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_digital_orders_realtime ON public.digital_orders;
CREATE TRIGGER trg_digital_orders_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.digital_orders
FOR EACH ROW EXECUTE FUNCTION public.realtime_notify_digital_orders();
