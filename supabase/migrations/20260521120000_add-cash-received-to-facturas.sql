ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS monto_recibido numeric(12, 2),
  ADD COLUMN IF NOT EXISTS cambio_devuelto numeric(12, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facturas_monto_recibido_non_negative'
  ) THEN
    ALTER TABLE facturas
      ADD CONSTRAINT facturas_monto_recibido_non_negative
      CHECK (monto_recibido IS NULL OR monto_recibido >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facturas_cambio_devuelto_non_negative'
  ) THEN
    ALTER TABLE facturas
      ADD CONSTRAINT facturas_cambio_devuelto_non_negative
      CHECK (cambio_devuelto IS NULL OR cambio_devuelto >= 0) NOT VALID;
  END IF;
END $$;
