-- Add updated_at column and triggers to new operational tables to support local-first incremental sync

CREATE OR REPLACE FUNCTION public.handle_updated_at() 
RETURNS trigger AS $$ 
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END; 
$$ language plpgsql;

-- compras
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
DROP TRIGGER IF EXISTS set_public_compras_updated_at ON public.compras;
CREATE TRIGGER set_public_compras_updated_at BEFORE UPDATE ON public.compras FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- compra_detalles
ALTER TABLE public.compra_detalles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
DROP TRIGGER IF EXISTS set_public_compra_detalles_updated_at ON public.compra_detalles;
CREATE TRIGGER set_public_compra_detalles_updated_at BEFORE UPDATE ON public.compra_detalles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- cxp_pagos
ALTER TABLE public.cxp_pagos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
DROP TRIGGER IF EXISTS set_public_cxp_pagos_updated_at ON public.cxp_pagos;
CREATE TRIGGER set_public_cxp_pagos_updated_at BEFORE UPDATE ON public.cxp_pagos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- cxc_pagos
ALTER TABLE public.cxc_pagos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
DROP TRIGGER IF EXISTS set_public_cxc_pagos_updated_at ON public.cxc_pagos;
CREATE TRIGGER set_public_cxc_pagos_updated_at BEFORE UPDATE ON public.cxc_pagos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- cuentas_pagar
ALTER TABLE public.cuentas_pagar ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
DROP TRIGGER IF EXISTS set_public_cuentas_pagar_updated_at ON public.cuentas_pagar;
CREATE TRIGGER set_public_cuentas_pagar_updated_at BEFORE UPDATE ON public.cuentas_pagar FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- cuentas_cobrar
ALTER TABLE public.cuentas_cobrar ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
DROP TRIGGER IF EXISTS set_public_cuentas_cobrar_updated_at ON public.cuentas_cobrar;
CREATE TRIGGER set_public_cuentas_cobrar_updated_at BEFORE UPDATE ON public.cuentas_cobrar FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- proveedores
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
DROP TRIGGER IF EXISTS set_public_proveedores_updated_at ON public.proveedores;
CREATE TRIGGER set_public_proveedores_updated_at BEFORE UPDATE ON public.proveedores FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- digital_orders
ALTER TABLE public.digital_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
DROP TRIGGER IF EXISTS set_public_digital_orders_updated_at ON public.digital_orders;
CREATE TRIGGER set_public_digital_orders_updated_at BEFORE UPDATE ON public.digital_orders FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- digital_order_items
ALTER TABLE public.digital_order_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
DROP TRIGGER IF EXISTS set_public_digital_order_items_updated_at ON public.digital_order_items;
CREATE TRIGGER set_public_digital_order_items_updated_at BEFORE UPDATE ON public.digital_order_items FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
