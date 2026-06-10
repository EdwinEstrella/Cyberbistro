-- Add metodo_pago and monto_pagado columns to compras table

ALTER TABLE public.compras 
ADD COLUMN IF NOT EXISTS metodo_pago varchar(20),
ADD COLUMN IF NOT EXISTS monto_pagado numeric DEFAULT 0.00;
