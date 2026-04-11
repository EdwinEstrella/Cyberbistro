-- InsForge Realtime: tablero de cocina en vivo (ejecutar una vez en el backend).
-- Canal por tenant: cocina:{tenant_id} — cada negocio solo escucha su UUID.
--
-- Endurecer suscripciones (evitar que un usuario escuche el canal de otro tenant):
--   ver insforge-realtime-cocina-rls.sql

INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('cocina:%', 'Actualizaciones del tablero de cocina por tenant', true)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.realtime_notify_comandas()
RETURNS TRIGGER AS $$
DECLARE
  tid uuid;
BEGIN
  tid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF TG_OP = 'DELETE' THEN
    PERFORM realtime.publish(
      'cocina:' || tid::text,
      'DELETE_comanda',
      jsonb_build_object('id', OLD.id::text, 'tenant_id', tid::text)
    );
    RETURN OLD;
  END IF;
  PERFORM realtime.publish(
    'cocina:' || tid::text,
    TG_OP || '_comanda',
    jsonb_build_object(
      'id', NEW.id::text,
      'tenant_id', tid::text,
      'estado', NEW.estado
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS comandas_realtime ON public.comandas;
CREATE TRIGGER comandas_realtime
  AFTER INSERT OR UPDATE OR DELETE ON public.comandas
  FOR EACH ROW
  EXECUTE FUNCTION public.realtime_notify_comandas();

CREATE OR REPLACE FUNCTION public.realtime_notify_cocina_estado()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM realtime.publish(
    'cocina:' || NEW.tenant_id::text,
    'UPDATE_cocina_estado',
    jsonb_build_object(
      'activa', NEW.activa,
      'tenant_id', NEW.tenant_id::text
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS cocina_estado_realtime ON public.cocina_estado;
CREATE TRIGGER cocina_estado_realtime
  AFTER INSERT OR UPDATE ON public.cocina_estado
  FOR EACH ROW
  EXECUTE FUNCTION public.realtime_notify_cocina_estado();
