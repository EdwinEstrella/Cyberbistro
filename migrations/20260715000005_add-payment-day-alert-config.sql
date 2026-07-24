ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS payment_day_of_month smallint;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_payment_day_of_month_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_payment_day_of_month_check
  CHECK (payment_day_of_month IS NULL OR payment_day_of_month BETWEEN 1 AND 31);

NOTIFY pgrst, 'reload schema';
