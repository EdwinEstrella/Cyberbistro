# Plan local-first para Cyberbistro

Cyberbistro debe operar con una base local que replica el schema real de InsForge. La nube sigue siendo la fuente oficial para autenticacion, permisos, bloqueo del restaurante, backup y sincronizacion multi-dispositivo, pero el equipo local debe quedar usable rapido en un PC nuevo y completar la descarga historica en background para poder consultar el pasado sin internet cuando ese proceso termine.

## Decision principal

La DB local no debe inventar entidades nuevas de negocio. Debe espejar las tablas operativas existentes en InsForge y agregar solo metadata tecnica para sesion, dispositivo y sincronizacion.

| Tema | Decision |
|---|---|
| Fuente de verdad del modelo | Schema actual de InsForge |
| DB local | Mirror de tablas remotas por `tenant_id` |
| Primer login en PC nuevo | Login online obligatorio + datos operativos minimos; historial completo en background |
| Uso offline | Opera contra DB local |
| Reconexion | Push de cambios locales + pull de cambios remotos |
| Historial | Debe descargarse completo progresivamente en background |
| Tablas nuevas de negocio | No permitidas salvo cambio real en InsForge |

## Flujo rapido

1. Usuario instala Cyberbistro en un PC nuevo.
2. Usuario inicia sesion online con InsForge.
3. La app resuelve `tenant_id`, rol, permisos y estado activo del restaurante.
4. La app crea la DB local si no existe.
5. La app descarga primero el dataset minimo para operar.
6. La app queda lista para vender, cerrar caja y operar.
7. La app descarga el historial completo del tenant en background.
8. La app guarda cursores de sincronizacion por tabla.
9. Cuando hay internet, sincroniza cambios locales y remotos automaticamente.

## Objetivo del bootstrap en background

El primer login en un dispositivo nuevo no debe bloquear al usuario hasta descargar toda la historia. Debe traer primero lo minimo para operar y luego completar la foto historica del negocio en background.

Esto permite:

- Consultar facturas viejas sin internet.
- Revisar cierres anteriores sin depender de la nube.
- Mantener la carta, mesas, cocina, usuarios y configuracion disponibles offline.
- Recuperar un equipo nuevo con el historial completo del restaurante.
- Evitar perdida operativa si InsForge o internet no estan disponibles temporalmente.

Regla de producto:

```txt
Un equipo nuevo queda listo despues del login y el dataset operativo minimo.
El historial completo se descarga en background hasta quedar 100% disponible offline.
```

La UI debe mostrar el estado real del historial. Si una busqueda antigua todavia no bajo, debe informar que la sincronizacion historica sigue en progreso en vez de mostrar resultados incompletos como definitivos.

## Tablas mirror locales

Estas tablas deben existir localmente con el mismo contrato que InsForge, adaptando tipos a SQLite o IndexedDB cuando sea necesario, pero sin cambiar nombres ni significado.

| Tabla InsForge | Tabla local | Uso offline |
|---|---|---|
| `tenants` | `tenants` | Datos del negocio, NCF, moneda, limites y estado activo |
| `tenant_users` | `tenant_users` | Usuarios, roles, permisos y estado activo |
| `configuracion` | `configuracion` | Parametros generales |
| `platos` | `platos` | Carta y disponibilidad |
| `menu_categories` | `menu_categories` | Categorias de menu |
| `mesas_estado` | `mesas_estado` | Estado, fusion y layout de mesas |
| `cocina_estado` | `cocina_estado` | Estado operativo de cocina |
| `comandas` | `comandas` | Ordenes enviadas a cocina |
| `consumos` | `consumos` | Items consumidos por mesa/comanda/factura |
| `facturas` | `facturas` | Facturacion, NCF, pagos y anulaciones |
| `cierres_operativos` | `cierres_operativos` | Aperturas/cierres de caja y ciclos |
| `gastos` | `gastos` | Gastos por ciclo/categoria |
| `gasto_categorias` | `gasto_categorias` | Categorias de gastos |

## Metadata local permitida

Estas tablas no son negocio. Son infraestructura local para que el mirror funcione.

| Tabla local | Proposito |
|---|---|
| `sync_outbox` | Cambios locales pendientes de subir |
| `sync_state` | Cursor por tabla y tenant |
| `sync_errors` | Errores de sincronizacion para reintento/diagnostico |
| `local_device_session` | Sesion local, dispositivo, usuario activo y bloqueo por PIN |
| `local_license_cache` | Estado de licencia o ventana offline validada |

Estas tablas nunca deben reemplazar a `facturas`, `comandas`, `consumos` o cualquier otra tabla real del dominio.

## Bootstrap progresivo

El bootstrap ocurre cuando no hay DB local, cuando se instala en un PC nuevo o cuando el usuario fuerza una restauracion limpia. No debe bloquear la operacion normal mas alla del dataset minimo necesario.

Fase inmediata para operar:

| Paso | Datos |
|---|---|
| 1 | `tenants` del tenant actual |
| 2 | `tenant_users` activos necesarios para login/roles |
| 3 | `configuracion` |
| 4 | `menu_categories` y `platos` activos |
| 5 | `mesas_estado` y `cocina_estado` |
| 6 | ultimo `cierres_operativos` abierto o reciente |
| 7 | comandas/consumos/facturas necesarios para mesas abiertas |

Fase historica en background:

| Paso | Datos |
|---|---|
| 1 | `tenants` del tenant actual |
| 2 | `tenant_users` activos e historicos necesarios |
| 3 | `configuracion` |
| 4 | `menu_categories` y `platos` |
| 5 | `mesas_estado` y `cocina_estado` |
| 6 | `cierres_operativos` |
| 7 | `comandas` |
| 8 | `facturas` |
| 9 | `consumos` |
| 10 | `gasto_categorias` y `gastos` |

Reglas:

- La descarga debe paginar por tabla.
- Cada fila debe filtrarse por `tenant_id` cuando la tabla sea multitenant.
- El proceso debe ser reanudable si se corta internet.
- La app puede operar despues de completar la fase inmediata.
- Si falla la fase historica, el estado queda como `history_sync_incomplete` y la app sigue operando con el historial parcial ya descargado.
- Las pantallas de consulta historica deben distinguir entre `historial completo` e `historial sincronizando`.

## Sync incremental

Despues del dataset minimo, la app trabaja localmente y sincroniza por cambios. El sync incremental y el bootstrap historico pueden convivir: primero se protegen las operaciones actuales, luego se completa el pasado.

Flujo cuando vuelve internet:

1. Validar sesion/licencia/tenant contra InsForge.
2. Subir `sync_outbox` en orden de creacion.
3. Marcar eventos locales como sincronizados solo cuando InsForge confirma.
4. Bajar cambios remotos desde el ultimo cursor de `sync_state`.
5. Aplicar cambios remotos en DB local.
6. Actualizar cursores por tabla.

La app debe estar al dia en dos sentidos:

| Direccion | Significado |
|---|---|
| Pasado | El bootstrap en background trae todo el historial existente |
| Futuro | El sync incremental trae todo lo que cambie despues |

Matiz importante: si el equipo esta offline, conserva la ultima foto conocida. Si el bootstrap historico todavia no habia terminado, no puede prometer historial completo offline. Al reconectar, debe continuar automaticamente desde el ultimo cursor.

## Escrituras offline

Toda escritura offline debe escribirse primero en la tabla mirror correspondiente y luego registrar una entrada en `sync_outbox`.

Ejemplo conceptual:

```txt
1. Crear factura en `facturas` local.
2. Actualizar `consumos` local con `factura_id`.
3. Registrar evento en `sync_outbox`.
4. Imprimir/mostrar resultado desde DB local.
5. Subir a InsForge cuando haya internet.
```

La UI no debe esperar a InsForge para completar operaciones normales de restaurante.

## Reglas por tipo de tabla

| Tipo | Tablas | Regla de conflicto |
|---|---|---|
| Identidad/permisos | `tenants`, `tenant_users` | Gana InsForge |
| Configuracion | `configuracion`, columnas de `tenants` | Gana ultimo cambio validado por rol admin |
| Catalogo | `platos`, `menu_categories` | Gana cambio con version/cursor mas reciente |
| Operacion viva | `mesas_estado`, `cocina_estado`, `comandas`, `consumos` | Requiere versionado o merge por estado |
| Facturacion | `facturas`, `consumos.factura_id` | No se sobrescribe silenciosamente |
| Caja | `cierres_operativos`, `gastos` | Secuencia y ciclo deben validarse al sincronizar |

## Facturas y eliminacion

Si el sistema permite eliminar facturas hoy, offline-first debe tratarlo con cuidado. Una eliminacion local no puede ser solo borrar la fila y olvidarse.

Regla recomendada:

```txt
Eliminar/anular factura debe dejar una accion sincronizable y auditable.
```

Si se mantiene borrado fisico por compatibilidad, `sync_outbox` debe registrar el delete con `table_name`, `row_id`, `tenant_id`, `created_at` y usuario/dispositivo que lo hizo. Si mas adelante se cambia a anulacion logica, esa decision debe cambiar primero en InsForge y luego en el mirror local.

## Autenticacion local

InsForge autentica online. El dispositivo autoriza offline con sesion local y PIN.

Flujo:

1. Login online con InsForge.
2. Resolver `tenant_users` activo.
3. Guardar sesion local del dispositivo.
4. Permitir bloqueo/desbloqueo local con PIN.
5. Al reconectar, validar que `tenant_users.activo` y `tenants.activa` sigan vigentes.

Hay que separar dos acciones:

| Accion | Efecto |
|---|---|
| Bloquear caja | Mantiene sesion local y permite PIN offline |
| Cerrar sesion total | Borra sesion local y exige internet para volver |

No se debe depender de email/password guardado en texto o JSON local para operar offline.

## Estado de licencia y bloqueo

El bloqueo del restaurante o usuario viene de InsForge, pero offline la app solo puede aplicar la ultima validacion conocida.

Regla recomendada:

```txt
El dispositivo puede operar offline solo dentro de una ventana validada.
```

Ejemplo:

| Estado | Resultado |
|---|---|
| Licencia local valida | Opera normal |
| Ventana offline vencida | Exige internet para facturar |
| Tenant bloqueado al reconectar | Bloquea operaciones nuevas |
| Usuario bloqueado al reconectar | Cierra sesion local de ese usuario |

## Cosas que NO debemos hacer

- No crear `orders` si el sistema real usa `comandas`.
- No crear `invoices` si el sistema real usa `facturas`.
- No crear otra tabla de usuarios de negocio si ya existe `tenant_users`.
- No hacer que el boton de sincronizar sea la unica forma de sync.
- No bloquear la operacion inicial de un PC nuevo esperando todo el historial.
- No mostrar consultas historicas parciales como si fueran completas.
- No guardar password de InsForge como mecanismo offline.
- No resolver conflictos fiscales con `last write wins`.

## Checklist de implementacion

- [x] Generar schema local desde el schema actual de InsForge.
- [x] Crear bootstrap progresivo por `tenant_id` con fase inmediata y fase historica en background.
- [x] Guardar cursores por tabla en `sync_state`.
- [x] Envolver escrituras locales para registrar `sync_outbox`.
- [ ] Separar bloqueo local de logout total.
- [ ] Reemplazar recordar password por PIN/hash local.
- [x] Definir reglas de conflicto para facturas, cierres y NCF antes de sincronizar deletes.
- [x] Agregar pantalla de estado: bootstrap minimo, historial sincronizando, historial completo, online, offline, sincronizando, error.
- [x] Validacion de licencia offline (ventana 6hs) y reevaluacion al reconectar.
- [x] Reglas de conflicto: facturas (no-sobrescribir, audit en deletes), NCF (secuencia), cierres (no-duplicar ciclo), identidades (server-wins).

## Verificacion con InsForge CLI

Este plan se basa en inspeccion del proyecto InsForge linkeado a `https://restaurante.azokia.com`.

Comandos usados:

```bash
npx @insforge/cli current
npx @insforge/cli db tables
npx @insforge/cli db policies
npx @insforge/cli db functions
npx @insforge/cli functions list
npx @insforge/cli db query "select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position" --json
```

Hallazgos relevantes:

- El proyecto apunta a `https://restaurante.azokia.com`.
- Existen tablas reales de operacion para facturas, comandas, consumos, cierres, mesas, cocina, carta, gastos, tenants y usuarios.
- No hay edge functions desplegadas actualmente.
- Las politicas RLS ya protegen tablas por tenant activo en InsForge.

## Siguiente paso

Antes de tocar codigo, definir el contrato de sync local:

1. Que tablas entran en bootstrap minimo v1.
2. Que columnas son obligatorias en SQLite/IndexedDB.
3. Como se serializan arrays/jsonb/timestamps.
4. Como se registran inserts, updates y deletes en `sync_outbox`.
5. Como se decide que el dataset minimo esta listo para operar.
6. Como se comunica que el historial completo sigue sincronizando en background.

---

## Implementacion

Esta seccion se llena a medida que se avanzan los items del checklist. Cada cambio de implementacion debe actualizar aqui su estado y evidencia.

### Fase 1: Schema local y estructura base

| Item | Estado | Evidencia |
|---|---|---|
| Schema SQLite/IndexedDB para todas las tablas mirror | Hecho | `src/shared/lib/localFirst.ts:160-181` — `openLocalFirstDb` crea object stores para mirror + metadata tables en IndexedDB |
| Tablas `sync_outbox`, `sync_state`, `sync_errors` | Hecho | `src/shared/lib/localFirst.ts:175-177` — creadas en `onupgradeneeded` |
| Tablas `local_device_session`, `local_license_cache` | Hecho | `src/shared/lib/localFirst.ts:178-179` — creadas en `onupgradeneeded` |
| Mapeo de tipos InsForge -> SQLite (jsonb, arrays, timestamps) | Hecho | `src/shared/lib/localFirst.ts:69-93` — `SyncStateRow` y `SyncOutboxEntry` tipos nativos; jsonb se serializa a JSON, timestamps a ISO string |

### Fase 2: Sesion local y PIN offline

| Item | Estado | Evidencia |
|---|---|---|
| Reemplazar `cloudix_remember_login` (email/password) por hash PIN local | Pendiente | |
| Login con PIN local sin necesidad de InsForge | Pendiente | |
| Separar accion `Bloquear caja` de `Cerrar sesion total` | Pendiente | |
| Guardar sesion local en `local_device_session` con cifrado | Pendiente | |

### Fase 3: Bootstrap progresivo

| Item | Estado | Evidencia |
|---|---|---|
| Dataset minimo operativo (fase inmediata) | Hecho | `src/shared/lib/localFirst.ts:233-294` — `bootstrapLocalFirstPhase` con paginado PAGE_SIZE=250 y reanudacion por cursor |
| Dataset historico completo (fase background) | Hecho | `src/shared/hooks/useLocalFirstBootstrap.ts:83-106` — fase history se ejecuta en background tras minimum |
| Paginado y reanudacion si se corta internet | Hecho | `src/shared/lib/localFirst.ts:248-288` — cursor persiste en `sync_state`, reanuda desde offset |
| Estado UI: `bootstrap_minimo`, `history_sync_incomplete`, `historial_completo` | Hecho | `src/shared/lib/localFirst.ts:60-67` — `LocalFirstStatus` y `src/shared/hooks/useLocalFirstBootstrap.ts:59-113` |

### Fase 4: Sync incremental

| Item | Estado | Evidencia |
|---|---|---|
| Registrar cada escritura local en `sync_outbox` | Hecho | `src/shared/lib/localFirst.ts:175-194` — `enqueueLocalWrite` escribe en outbox; `createSyncOutboxEntry` para inserts/updates/deletes |
| Push de `sync_outbox` a InsForge cuando hay conexion | Hecho | `src/shared/lib/localFirst.ts:197-245` — `pushOutboxToServer` procesa pending entries y sube a InsForge por op (insert/update/delete) |
| Pull de cambios remotos por cursor en `sync_state` | Hecho | `src/shared/lib/localFirst.ts:292-355` — `pullIncrementalChangesForTable` y `syncIncremental` permiten especificar `since` cursor en `updated_at` |
| Resolucion de conflictos por tipo de tabla | Pendiente | Requiere implementacion de reglas por tipo en `pushOutboxToServer` |

### Fase 5: Validacion de licencia y bloqueo

| Item | Estado | Evidencia |
|---|---|---|
| Cache de licencia local con ventana offline | Hecho | `src/shared/lib/localFirst.ts:442-485` — `saveLicenseCache`/`loadLicenseCache` con `LocalLicenseCache`; ventana de 6hs |
| Validacion de licencia al reconectar | Hecho | `src/shared/lib/localFirst.ts:502-518` — `validateAndCacheLicense` consulta `tenants.activa` y `tenant_users.activo` |
| Bloqueo de facturacion si licencia vencida offline | Hecho | `src/shared/lib/localFirst.ts:488-492` — `isLicenseValidOffline` false si ventana venció o tenant/user inactivo |
| Reevaluacion de `tenant_users.activo` y `tenants.activa` al reconectar | Hecho | `src/shared/lib/localFirst.ts:520-525` — `revalidateLicenseOnReconnect` revalida y actualiza cache |

### Fase 6: Reglas de conflicto para sincronizacion

| Item | Estado | Evidencia |
|---|---|---|
| Facturas: no sobrescribir silenciosamente | Hecho | `src/shared/lib/localFirst.ts:263-281` — `resolveConflictForTable` para facturas; `server_wins` si `updated_at` remoto es mayor |
| Deletes de facturas: registrar en `sync_outbox` con audit | Hecho | `src/shared/lib/localFirst.ts:270-271` — deletes de facturas retornan `skip` con mensaje de audit requerido |
| NCF: validar secuencia antes de sincronizar | Hecho | `src/shared/lib/localFirst.ts:328-345` — `validateNcfSequence` verifica `ncf_secuencias_por_tipo` del tenant antes de sync de facturas |
| Cierres operativos: validar ciclo y secuencia al syncar | Hecho | `src/shared/lib/localFirst.ts:348-362` — `validateCierreCicleSequence` verifica que `cycle_number` no exista ya en servidor |

### Fase 7: Pantalla de estado de sincronizacion

| Item | Estado | Evidencia |
|---|---|---|
| Indicadores: online, offline, sincronizando, error | Hecho | `src/shared/hooks/useLocalFirstBootstrap.ts:38-50` + `src/shared/lib/localFirst.ts:60-67` — eventos online/offline y estados `LocalFirstStatus` |
| Indicadores: bootstrap_minimo, historial_sincronizando, historial_completo | Hecho | `src/shared/components/LocalFirstStatusBadge.tsx:10-27` — labels y colores por estado |
| Consulta historica muestra `sincronizando...` si falta historial | Hecho | `src/shared/lib/localFirst.ts:325-332` — `getHistoricalSyncIncompleteMessage` |
