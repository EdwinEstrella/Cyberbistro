-- Categorias de menu por restaurante.
-- La tabla reemplaza la lista fija del frontend como fuente editable por tenant.

CREATE TABLE IF NOT EXISTS public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  color text NOT NULL DEFAULT '#a1a1aa',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_categories_nombre_not_blank CHECK (length(trim(nombre)) > 0),
  CONSTRAINT menu_categories_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_categories_tenant_nombre_idx
ON public.menu_categories (tenant_id, lower(nombre));

CREATE INDEX IF NOT EXISTS menu_categories_tenant_sort_idx
ON public.menu_categories (tenant_id, sort_order, nombre);

CREATE OR REPLACE FUNCTION public.cyberbistro_current_admin_tenant_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT tu.tenant_id), ARRAY[]::uuid[])
  FROM public.tenant_users tu
  WHERE tu.activo IS TRUE
    AND tu.rol = 'admin'
    AND (
      tu.auth_user_id = public.cyberbistro_auth_user_id()
      OR lower(tu.email) = lower(COALESCE(public.cyberbistro_auth_email(), ''))
    );
$$;

GRANT EXECUTE ON FUNCTION public.cyberbistro_current_admin_tenant_ids() TO PUBLIC;

INSERT INTO public.menu_categories (tenant_id, nombre, color, sort_order)
SELECT
  seeded.tenant_id,
  seeded.nombre,
  CASE seeded.nombre
    WHEN 'Entradas' THEN '#9ca3af'
    WHEN 'Hamburguesas' THEN '#ff2d55'
    WHEN 'Pastas' THEN '#ffd60a'
    WHEN 'Sushi' THEN '#ff9f0a'
    WHEN 'Postres' THEN '#ff3b30'
    WHEN 'Bebidas' THEN '#32d74b'
    WHEN 'Mofongos' THEN '#eab308'
    WHEN 'Mariscos' THEN '#64d2ff'
    WHEN 'Salchipapa' THEN '#ff9500'
    WHEN 'Quesadillas' THEN '#fb7185'
    WHEN 'Yaroas' THEN '#bf5af2'
    WHEN 'Burritos' THEN '#5ac8fa'
    WHEN 'Sandwich' THEN '#007aff'
    WHEN 'Burritos sandwich' THEN '#22d3ee'
    WHEN 'Tacos' THEN '#ff375f'
    WHEN 'Menú especial' THEN '#34c759'
    WHEN 'Plato del día' THEN '#facc15'
    WHEN 'Menu especial' THEN '#34c759'
    WHEN 'Plato del dia' THEN '#facc15'
    WHEN 'General' THEN '#a1a1aa'
    ELSE '#ff906d'
  END,
  seeded.sort_order
FROM (
  SELECT
    tenant_id,
    nombre,
    row_number() OVER (PARTITION BY tenant_id ORDER BY min_order, nombre)::integer - 1 AS sort_order
  FROM (
    SELECT
      tenant_id,
      trim(categoria) AS nombre,
      min(
        CASE trim(categoria)
          WHEN 'Entradas' THEN 0
          WHEN 'Hamburguesas' THEN 1
          WHEN 'Pastas' THEN 2
          WHEN 'Sushi' THEN 3
          WHEN 'Postres' THEN 4
          WHEN 'Bebidas' THEN 5
          WHEN 'Mofongos' THEN 6
          WHEN 'Mariscos' THEN 7
          WHEN 'Salchipapa' THEN 8
          WHEN 'Quesadillas' THEN 9
          WHEN 'Yaroas' THEN 10
          WHEN 'Burritos' THEN 11
          WHEN 'Sandwich' THEN 12
          WHEN 'Tacos' THEN 13
          WHEN 'Menú especial' THEN 14
          WHEN 'Plato del día' THEN 15
          WHEN 'Menu especial' THEN 14
          WHEN 'Plato del dia' THEN 15
          WHEN 'General' THEN 16
          ELSE 999
        END
      ) AS min_order
    FROM public.platos
    WHERE trim(categoria) <> ''
    GROUP BY tenant_id, trim(categoria)
  ) existing_categories
) seeded
ON CONFLICT (tenant_id, lower(nombre)) DO NOTHING;

INSERT INTO public.menu_categories (tenant_id, nombre, color, sort_order)
SELECT t.id, 'General', '#a1a1aa', 999
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.menu_categories mc
  WHERE mc.tenant_id = t.id
);

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_menu_categories_tenant_select ON public.menu_categories;
DROP POLICY IF EXISTS cb_menu_categories_admin_all ON public.menu_categories;
DROP POLICY IF EXISTS project_admin_policy ON public.menu_categories;

CREATE POLICY cb_menu_categories_tenant_select
ON public.menu_categories
FOR SELECT
TO PUBLIC
USING (
  public.cyberbistro_is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = menu_categories.tenant_id
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cyberbistro_auth_user_id()
        OR (
          tu.auth_user_id IS NULL
          AND lower(tu.email) = lower(public.cyberbistro_auth_email())
        )
      )
  )
);

CREATE POLICY cb_menu_categories_admin_all
ON public.menu_categories
FOR ALL
TO PUBLIC
USING (
  public.cyberbistro_is_super_admin()
  OR tenant_id = ANY(public.cyberbistro_current_admin_tenant_ids())
)
WITH CHECK (
  public.cyberbistro_is_super_admin()
  OR tenant_id = ANY(public.cyberbistro_current_admin_tenant_ids())
);

CREATE POLICY project_admin_policy
ON public.menu_categories
FOR ALL
TO project_admin
USING (true)
WITH CHECK (true);
