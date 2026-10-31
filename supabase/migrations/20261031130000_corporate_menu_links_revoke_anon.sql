-- Supabase grants EXECUTE to anon on new functions via default privileges,
-- so REVOKE ... FROM PUBLIC is not enough. Only get_menu_by_link and
-- create_order_by_link are meant to be callable without a session.
REVOKE EXECUTE ON FUNCTION public.menu_business_today(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.menu_business_isodow(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.menu_business_date(timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.menu_link_menu_available(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_company_digital_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revert_company_digital_order_accept(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_digital_order_item(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_company_statement(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_menu_items_tenant_integrity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_menu_links_tenant_integrity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_plato_sold_out_tenant_integrity() FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
