-- =============================================================================
-- Opcional: aislar suscripciones Realtime por tenant (InsForge multitenant)
-- =============================================================================
-- Sin RLS, cualquier cliente autenticado que conozca el UUID de otro negocio
-- podría intentar suscribirse a `cocina:<uuid-ajeno>` y recibir eventos.
-- Con esta política, solo podés suscribirte al canal cuyo sufijo coincide con
-- tu `tenant_id` en `tenant_users` (vinculado a auth.uid()).
--
-- Requisitos:
-- - Usuarios con sesión InsForge Auth (rol `authenticated`), no solo anon.
-- - Probar en staging: al activar RLS sin políticas adecuadas se bloquea todo.
--
-- Ejecutar DESPUÉS de `insforge-realtime-cocina.sql` (canal `cocina:%` ya creado).

ALTER TABLE realtime.channels ENABLE ROW LEVEL SECURITY;

-- Quitar política previa si re-ejecutás el script
DROP POLICY IF EXISTS cocina_subscribe_own_tenant ON realtime.channels;

CREATE POLICY cocina_subscribe_own_tenant
  ON realtime.channels
  FOR SELECT
  TO authenticated
  USING (
    pattern = 'cocina:%'
    AND EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.auth_user_id = auth.uid()
        AND COALESCE(tu.activo, true)
        AND tu.tenant_id::text = split_part(realtime.channel_name(), ':', 2)
    )
  );

-- Si InsForge usa otro rol para el JWT de app, ajustá TO authenticated / añadí políticas.
-- La app debe conectar Realtime con el mismo token de usuario que usa la API tras login.
