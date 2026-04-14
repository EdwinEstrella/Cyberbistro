# Seguridad y multitenant (Cyberbistro)

Contexto: **Cyberbistro se distribuye y usa como app Electron en escritorio** (no como SPA pública en la web). El modelo de amenaza incluye usuarios con acceso al equipo y al `.asar`; por eso no debe ir apiKey de servicio en el cliente.

## Modelo de amenaza

- La app es **SaaS multi-empresa**: cada negocio es un `tenant_id`; los usuarios operan solo sobre su fila en `tenant_users` y datos con ese `tenant_id`.
- El **renderer** (ventana Electron) usa el SDK InsForge con **anon key** y JWT de sesión. Cualquier bug que omita `.eq('tenant_id', …)` puede leer o escribir datos de otro tenant si el token tiene permisos amplios.
- **Defensa en profundidad**: además de filtros en el cliente, conviene **RLS en PostgreSQL** en tablas de negocio (`facturas`, `comandas`, `consumos`, `mesas_estado`, `cocina_estado`, `platos`, `tenant_users`, etc.) restringiendo filas al tenant permitido por el JWT (según cómo InsForge exponga `auth.uid()` o claims).

## Auditoría de consultas (`limit(1)` y similares)

Revisado el código del renderer:

- **`cocina_estado`**: debe filtrarse siempre por `tenant_id` (corregido en `AppLayout` y `Dashboard.sendToKitchen`). Cocina ya lo hacía.
- **Consultas a `consumos` / `mesas_estado`**: deben incluir `.eq('tenant_id', tenantId)` cuando correspondan datos del negocio.
- **Excepciones intencionales**: búsquedas globales por `auth_user_id` o email en `resolveTenantUserFromAuth` (resolver tenant del usuario), y lecturas de `tenants` por `.eq('id', tenantId)` cuando `tenantId` viene de la sesión.

Mantener este documento al añadir tablas nuevas: cada query multitenant debe poder justificarse aquí o en comentario junto al código.

## RLS en Postgres (plantilla)

Las políticas exactas dependen de cómo InsForge inyecte el JWT en Postgres. Patrón ilustrativo (adaptar a la API real de la plataforma):

```sql
-- Ejemplo conceptual — confirmar sintaxis con InsForge antes de ejecutar.
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY ... USING (tenant_id = <tenant del token>);
```

Repetir en tablas multitenant (`comandas`, `consumos`, `mesas_estado`, `cocina_estado`, etc.).

Estado actual en este proyecto:

- SQL aplicado en backend para habilitar RLS + políticas de aislamiento por `tenant_id` en:
  `facturas`, `consumos`, `comandas`, `mesas_estado`, `cocina_estado`, `platos`.
- Script versionado: `sql/cyberbistro_multitenant_rls.sql`.

## NCF atómico

La secuencia fiscal debe reservarse en **una sola transacción en Postgres** (función `cyberbistro_reserve_ncf` + RPC). Ver `sql/cyberbistro_reserve_ncf.sql`.

Estado actual:

- RPC `public.cyberbistro_reserve_ncf(uuid)` creada en backend.
- Cliente actualizado para usar la RPC de forma preferente (`resolveNcfForNewInvoice`) y fallback legado solo si la RPC no responde.

## Secretos

- No incluir **apiKey** de InsForge en el bundle del cliente.
- `VITE_INSFORGE_ANON_KEY` y `VITE_INSFORGE_BASE_URL` solo en `.env` (no commitear `.env`).
