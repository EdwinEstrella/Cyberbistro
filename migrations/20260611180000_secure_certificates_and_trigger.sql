-- Migración para securizar claves de certificados y sincronizar atómicamente el estado fiscal en facturas

-- 1. Restringir privilegios de SELECT en columnas sensibles de ecf_certificate_metadata para roles públicos
REVOKE SELECT ON public.ecf_certificate_metadata FROM authenticated, anon, public;

GRANT SELECT (
  id,
  tenant_id,
  environment,
  subject,
  issuer,
  serial_number,
  valid_from,
  valid_until,
  is_ready,
  last_validation_error,
  created_at,
  updated_at
) ON public.ecf_certificate_metadata TO authenticated, anon;

GRANT SELECT ON public.ecf_certificate_metadata TO project_admin, service_role;

-- 2. Crear trigger para mantener sincronizado facturas.fiscal_status y fiscal_document_id con ecf_documents
CREATE OR REPLACE FUNCTION public.sync_factura_fiscal_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.facturas
  SET 
    fiscal_status = NEW.status,
    fiscal_document_id = NEW.id
  WHERE id = NEW.factura_id AND tenant_id = NEW.tenant_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_factura_fiscal_status ON public.ecf_documents;

CREATE TRIGGER trg_sync_factura_fiscal_status
AFTER INSERT OR UPDATE OF status ON public.ecf_documents
FOR EACH ROW
EXECUTE FUNCTION public.sync_factura_fiscal_status();
