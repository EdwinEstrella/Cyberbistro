-- ============================================================
-- Migration: Enforce Menu Link Limits and Prohibit New Public Links
-- Part of Feature: corporativo-plan (Task C-T2)
-- ============================================================

-- 1. Helper function: menu_links_plan_limit
CREATE OR REPLACE FUNCTION public.menu_links_plan_limit(p_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE lower(trim(COALESCE(p_plan, '')))
    WHEN 'empresarial' THEN 2
    WHEN 'corporativo' THEN 6
    ELSE 0
  END;
$$;

-- 2. Trigger function to enforce link limits and prohibit new public links
CREATE OR REPLACE FUNCTION public.enforce_menu_link_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_plan  text;
  v_limit integer;
  v_count integer;
BEGIN
  -- New public links are no longer allowed on INSERT (existing rows untouched)
  IF TG_OP = 'INSERT' AND NEW.link_type = 'public' THEN
    RAISE EXCEPTION 'PUBLIC_LINK_NOT_ALLOWED';
  END IF;

  -- Limit check on enabled company links
  IF NEW.enabled IS TRUE AND NEW.link_type = 'company' THEN
    -- Lock tenant row to serialize concurrent creates / updates
    SELECT plan INTO v_plan
    FROM public.tenants
    WHERE id = NEW.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_NOT_FOUND';
    END IF;

    v_limit := public.menu_links_plan_limit(v_plan);

    -- Count other enabled company links of the tenant (exclude NEW.id)
    SELECT count(*) INTO v_count
    FROM public.menu_links
    WHERE tenant_id = NEW.tenant_id
      AND enabled IS TRUE
      AND link_type = 'company'
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'LINK_LIMIT_REACHED';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger on menu_links
DROP TRIGGER IF EXISTS trg_menu_links_limits ON public.menu_links;
CREATE TRIGGER trg_menu_links_limits
  BEFORE INSERT OR UPDATE OF enabled, link_type
  ON public.menu_links
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_menu_link_limits();

-- 4. Permissions lockdown
REVOKE EXECUTE ON FUNCTION public.enforce_menu_link_limits() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.menu_links_plan_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.menu_links_plan_limit(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
