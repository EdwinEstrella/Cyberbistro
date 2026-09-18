-- Add core tables to supabase_realtime publication for real-time multi-device synchronization
ALTER PUBLICATION supabase_realtime ADD TABLE 
  public.facturas, 
  public.cierres_operativos, 
  public.gastos, 
  public.cuentas_cobrar, 
  public.cxc_pagos, 
  public.cuentas_pagar, 
  public.cxp_pagos, 
  public.compras, 
  public.customers;
