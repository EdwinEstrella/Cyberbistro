import fs from 'node:fs'

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function write(file, content) {
  fs.writeFileSync(file, content, 'utf8')
}

function replaceOnce(content, oldValue, newValue, label) {
  const first = content.indexOf(oldValue)
  if (first < 0) throw new Error(`No se encontró el bloque: ${label}`)
  if (content.indexOf(oldValue, first + oldValue.length) >= 0) {
    throw new Error(`El bloque no es único: ${label}`)
  }
  return content.slice(0, first) + newValue + content.slice(first + oldValue.length)
}

function replaceAfter(content, marker, oldValue, newValue, label) {
  const markerIndex = content.indexOf(marker)
  if (markerIndex < 0) throw new Error(`No se encontró el marcador: ${label}`)
  const first = content.indexOf(oldValue, markerIndex + marker.length)
  if (first < 0) throw new Error(`No se encontró el bloque después del marcador: ${label}`)
  return content.slice(0, first) + newValue + content.slice(first + oldValue.length)
}

function patchCloudAvailability() {
  const file = 'src/shared/lib/cloudAvailability.ts'
  let content = read(file)

  content = replaceOnce(
    content,
    `export function isDesktopRuntime(): boolean {\n  if (typeof window === "undefined") return false;\n  return Boolean((window as Window & { electronAPI?: unknown }).electronAPI);\n}\n`,
    `export function isDesktopRuntime(): boolean {\n  if (typeof window === "undefined") return false;\n  return Boolean((window as Window & { electronAPI?: unknown }).electronAPI);\n}\n\nexport function isOfflineCapableRuntime(): boolean {\n  if (typeof window === "undefined") return false;\n  const edgeHosted =\n    (window.location.protocol === "http:" || window.location.protocol === "https:") &&\n    window.location.port === "47821";\n  return isDesktopRuntime() || edgeHosted || import.meta.env.VITE_ENABLE_WEB_LOCAL_FIRST === "true";\n}\n`,
    'runtime local-first',
  )

  content = content.replace(
    'cloudAvailable: !isDesktopRuntime() || (internetOnline && circuitState === "closed"),',
    'cloudAvailable: !isOfflineCapableRuntime() || (internetOnline && circuitState === "closed"),',
  )
  content = content.replaceAll('if (!isDesktopRuntime()) return;', 'if (!isOfflineCapableRuntime()) return;')
  content = content.replace('if (!isDesktopRuntime()) return true;', 'if (!isOfflineCapableRuntime()) return true;')
  content = content.replace(
    'return isDesktopRuntime() && !(await probeCloudAvailability(false));',
    'return isOfflineCapableRuntime() && !(await probeCloudAvailability(false));',
  )

  write(file, content)
}

function patchUseAuth() {
  const file = 'src/shared/hooks/useAuth.ts'
  let content = read(file)

  content = content.replace(
    `import { getLocalDeviceSession, setLastTenantId, saveLocalDeviceSession, saveLicenseCache, loadLicenseCache, isLicenseValidOffline } from '../lib/localFirst';`,
    `import { getLocalDeviceSession, setLastTenantId, saveLocalDeviceSession, saveLicenseCache, loadLicenseCache, isLicenseValidOffline, isLocalFirstEnabled } from '../lib/localFirst';`,
  )

  content = replaceAfter(
    content,
    'async function loadUserDataShared',
    `      const storedToken = readRefreshToken();\n`,
    `      const storedToken = readRefreshToken();\n      const localFirstRuntime = isLocalFirstEnabled();\n      const cloudUnavailable = localFirstRuntime ? await isDesktopCloudUnavailable() : !navigator.onLine;\n      const canReachCloud = navigator.onLine && !cloudUnavailable;\n\n      const hydrateLocalFallback = async (): Promise<boolean> => {\n        if (!localFirstRuntime || hydratedFromLocalSession) return hydratedFromLocalSession;\n        const localSession = await getLocalDeviceSession();\n        if (!localSession) return false;\n\n        const licenseCache = await loadLicenseCache(localSession.tenant_id);\n        u = userFromLocalDeviceSession(localSession);\n        tenantAccessTenantId = localSession.tenant_id;\n        hydratedFromLocalSession = true;\n\n        if (licenseCache && !isLicenseValidOffline(licenseCache)) {\n          patchSharedState({\n            user: u,\n            tenantUser: null,\n            tenantAccessDeniedReason: 'blocked',\n            accessValidationState: 'denied',\n            loading: false,\n          });\n          logAuth('loadUserData:local-suspension-marker-kept-denied', { tenantId: localSession.tenant_id });\n          return true;\n        }\n\n        u = hydrateAuthStateFromLocalDeviceSession(localSession);\n        patchSharedState({ accessValidationState: 'validated' });\n        return true;\n      };\n`,
    'bootstrap local session helper',
  )

  content = replaceAfter(
    content,
    'const canReachCloud = navigator.onLine && !cloudUnavailable;',
    '      if (navigator.onLine) {',
    '      if (canReachCloud) {',
    'estado online de auth',
  )

  content = replaceOnce(
    content,
    `      // Never mount protected routes from the desktop snapshot while online:\n      // the backend must validate tenant access first, otherwise a blocked\n      // tenant can briefly remount and reconnect realtime on every focus.\n      if (Boolean((window as any).electronAPI) && !navigator.onLine) {\n        const localSession = await getLocalDeviceSession();\n        if (localSession) {\n          const licenseCache = await loadLicenseCache(localSession.tenant_id);\n          if (licenseCache && !isLicenseValidOffline(licenseCache)) {\n            u = userFromLocalDeviceSession(localSession);\n            tenantAccessTenantId = localSession.tenant_id;\n            patchSharedState({\n              user: u,\n              tenantUser: null,\n              tenantAccessDeniedReason: 'blocked',\n              accessValidationState: 'denied',\n              loading: false,\n            });\n            ensureTenantAccessRealtime(localSession.tenant_id, u?.id);\n            logAuth('loadUserData:offline-suspension-marker-kept-denied', { tenantId: localSession.tenant_id });\n          } else {\n            u = hydrateAuthStateFromLocalDeviceSession(localSession);\n          }\n          hydratedFromLocalSession = true;\n          if (!licenseCache || isLicenseValidOffline(licenseCache)) {\n            patchSharedState({ accessValidationState: 'validated' });\n          }\n        }\n      }\n`,
    `      // Local-first means a validated local session remains usable whenever\n      // the cloud endpoint is unavailable, even if Windows still reports Wi-Fi.\n      if (!canReachCloud) {\n        await hydrateLocalFallback();\n      }\n`,
    'fallback local de autenticación',
  )

  content = content.replace('if (storedToken && navigator.onLine) {', 'if (storedToken && canReachCloud) {')
  content = content.replace('} else if (storedToken && !navigator.onLine) {', '} else if (storedToken && !canReachCloud) {')
  content = content.replace(
    `        } else {\n          logAuth('bootstrap refresh transient error', refreshError);\n        }`,
    `        } else {\n          logAuth('bootstrap refresh transient error', refreshError);\n          await hydrateLocalFallback();\n        }`,
  )
  content = replaceAfter(
    content,
    `logAuth('loadUserData:no-user-after-refresh'`,
    `        if (!navigator.onLine) {`,
    `        if (!canReachCloud) {`,
    'reintentos auth offline',
  )
  content = replaceAfter(
    content,
    `        if (!u) {\n          return;\n        }`,
    `        if (!u) {\n          return;\n        }`,
    `        if (!u) {\n          const restored = await hydrateLocalFallback();\n          if (!restored) return;\n        }`,
    'fallback tras reintentos auth',
  )
  content = replaceAfter(
    content,
    `logAuth('loadUserData:user-ok'`,
    `      if (navigator.onLine) {`,
    `      if (canReachCloud) {`,
    'resolución tenant cloud',
  )
  content = content.replaceAll('if (Boolean((window as any).electronAPI)) {', 'if (localFirstRuntime) {')

  content = replaceAfter(
    content,
    `async function doRefreshShared`,
    `  if (!navigator.onLine) {\n    logAuth(\`refresh skipped [\${source}] (offline)\`);\n    return;\n  }\n`,
    `  if (!navigator.onLine) {\n    logAuth(\`refresh skipped [\${source}] (offline)\`);\n    return;\n  }\n  if (await isDesktopCloudUnavailable()) {\n    logAuth(\`refresh skipped [\${source}] (cloud unavailable; local session kept)\`);\n    return;\n  }\n`,
    'refresh sin cloud',
  )

  content = content.replace(
    `if (currentTenantId && Boolean((window as any).electronAPI)) {`,
    `if (currentTenantId && isLocalFirstEnabled()) {`,
  )

  write(file, content)
}

function patchLocalFirst() {
  const file = 'src/shared/lib/localFirst.ts'
  let content = read(file)

  content = replaceOnce(
    content,
    `import { isCloudAvailabilityFailure, isCloudAvailableForDesktop, isDesktopRuntime, recordCloudFailure, recordCloudSuccess } from "./cloudAvailability";\n`,
    `import { isCloudAvailabilityFailure, isCloudAvailableForDesktop, isDesktopRuntime, recordCloudFailure, recordCloudSuccess } from "./cloudAvailability";\nimport { commitLanEdgeCursor, getLanEdgeBaseUrl, publishLanOutboxEntry, publishLanSnapshotEntries, pullLanOutboxEntries } from "./lanEdgeClient";\n`,
    'import LAN edge',
  )

  content = replaceOnce(
    content,
    `export function isLocalFirstEnabled(): boolean {\n  if (typeof window === "undefined") return false;\n  if (Boolean((window as Window & { electronAPI?: unknown }).electronAPI)) return true;\n  return import.meta.env.VITE_ENABLE_WEB_LOCAL_FIRST === "true";\n}\n\nexport function resolveLocalWriteMode(args: { isDesktop: boolean; isOnline: boolean }): LocalWriteMode {\n  void args.isOnline;\n  return args.isDesktop ? "desktop-local-first" : "web-server-first";\n}\n`,
    `export function isLocalFirstEnabled(): boolean {\n  if (typeof window === "undefined") return false;\n  if (Boolean((window as Window & { electronAPI?: unknown }).electronAPI)) return true;\n  const edgeHosted =\n    (window.location.protocol === "http:" || window.location.protocol === "https:") &&\n    window.location.port === "47821";\n  return edgeHosted || import.meta.env.VITE_ENABLE_WEB_LOCAL_FIRST === "true";\n}\n\nexport function resolveLocalWriteMode(args: { isDesktop: boolean; isOnline: boolean }): LocalWriteMode {\n  void args.isOnline;\n  return args.isDesktop || isLocalFirstEnabled() ? "desktop-local-first" : "web-server-first";\n}\n`,
    'política local-first',
  )

  content = replaceOnce(
    content,
    `export async function resolveNcfForNewInvoiceLocalFirst(\n  tenantId: string,\n  preferredType?: string | null\n): Promise<ResolvedNcfForInvoice | null> {\n  if (isDesktopRuntime() && !(await isCloudAvailableForDesktop())) {\n    return reserveLocalNcfForNewInvoice(tenantId, preferredType);\n  }\n\n  return resolveNcfForNewInvoice(tenantId, preferredType);\n}\n`,
    `export async function resolveNcfForNewInvoiceLocalFirst(\n  tenantId: string,\n  preferredType?: string | null\n): Promise<ResolvedNcfForInvoice | null> {\n  if (isLocalFirstEnabled()) {\n    return reserveLocalNcfForNewInvoice(tenantId, preferredType);\n  }\n\n  return resolveNcfForNewInvoice(tenantId, preferredType);\n}\n`,
    'NCF local primero',
  )

  content = replaceAfter(
    content,
    `async function writeLocalOutboxEntry`,
    `}\n\nasync function getPendingOutboxEntries`,
    `}\n\nasync function writeLocalMutationAtomically(\n  args: {\n    tenantId: string;\n    tableName: LocalFirstMirrorTable;\n    rowId: string;\n    op: SyncOutboxEntry["op"];\n    payload?: Record<string, unknown> | null;\n  },\n  entry: SyncOutboxEntry,\n): Promise<void> {\n  const db = await openLocalFirstDbForSync(args.tenantId);\n  try {\n    await new Promise<void>((resolve, reject) => {\n      const tx = db.transaction([args.tableName, "sync_outbox"], "readwrite");\n      const mirrorStore = tx.objectStore(args.tableName);\n      const outboxStore = tx.objectStore("sync_outbox");\n\n      if (args.op === "delete") {\n        mirrorStore.delete(args.rowId);\n      } else if (args.payload) {\n        if (args.op === "insert") {\n          mirrorStore.put(args.payload);\n        } else {\n          const getReq = mirrorStore.get(args.rowId);\n          getReq.onsuccess = () => {\n            const merged = buildLocalMirrorWriteResult({\n              op: args.op,\n              rowId: args.rowId,\n              existing: (getReq.result as Record<string, unknown> | undefined) ?? undefined,\n              payload: args.payload,\n            });\n            if (merged) mirrorStore.put(merged);\n          };\n          getReq.onerror = () => reject(getReq.error ?? new Error("No se pudo leer el mirror local."));\n        }\n      }\n\n      const addReq = outboxStore.add(entry);\n      addReq.onerror = (event) => {\n        if (addReq.error?.name === "ConstraintError") {\n          event.preventDefault();\n          event.stopPropagation();\n          return;\n        }\n        reject(addReq.error ?? new Error("No se pudo registrar sync_outbox."));\n      };\n\n      tx.oncomplete = () => resolve();\n      tx.onerror = () => reject(tx.error ?? new Error("No se pudo confirmar la transacción local."));\n      tx.onabort = () => reject(tx.error ?? new Error("La transacción local fue cancelada."));\n    });\n  } finally {\n    db.close();\n  }\n}\n\nasync function getPendingOutboxEntries`,
    'transacción local atómica',
  )

  content = replaceOnce(
    content,
    `  await writeLocalOutboxEntry(args.tenantId, entry);\n\n  // Apply change locally to mirror table so the UI can see it immediately offline\n  await applyLocalMirrorWrite(args);\n`,
    `  // Mirror + outbox are committed in one IndexedDB transaction. A crash can no\n  // longer leave visible data without a sync event, or an event without its data.\n  await writeLocalMutationAtomically(args, entry);\n\n  void publishLanOutboxEntry(entry, true).catch((error) => {\n    console.warn("Cloudix LAN Edge no recibió el cambio todavía:", error);\n  });\n`,
    'escritura local atómica y LAN',
  )

  content = replaceOnce(
    content,
    `export function isLicenseValidOffline(cache: LocalLicenseCache | null): boolean {\n  if (!cache) return false;\n  if (!cache.tenant_activa || !cache.tenant_users_activo) return false;\n  return new Date(cache.window_valid_until) > new Date();\n}\n`,
    `export function isLicenseValidOffline(cache: LocalLicenseCache | null): boolean {\n  if (!cache) return false;\n  // The cloud is a synchronisation/administration service, not an operational\n  // dependency. Keep the last explicit active/inactive decision until a future\n  // successful revalidation replaces it.\n  return cache.tenant_activa && cache.tenant_users_activo;\n}\n`,
    'licencia offline sin vencimiento operativo',
  )

  content = content.replace(
    'reason: "Licencia offline expirada o ausente. Requiere reconexión para revalidar.",',
    'reason: "No existe una validación local activa para este restaurante o usuario.",',
  )

  content = replaceOnce(
    content,
    `    if (tenantErr || !tenant?.activa) {\n      await saveLicenseCache(tenantId, false, false);\n      return { valid: false, reason: "Tenant bloqueado o inactivo." };\n    }\n`,
    `    if (tenantErr) {\n      if (isCloudAvailabilityFailure(tenantErr)) {\n        return assertCanWriteOffline(tenantId);\n      }\n      return { valid: false, reason: "No se pudo validar el restaurante." };\n    }\n    if (!tenant?.activa) {\n      await saveLicenseCache(tenantId, false, false);\n      return { valid: false, reason: "Tenant bloqueado o inactivo." };\n    }\n`,
    'error tenant no equivale a bloqueo',
  )

  content = replaceOnce(
    content,
    `    if (tuErr || !tu || tu.length === 0) {\n      await saveLicenseCache(tenantId, true, false);\n      return { valid: false, reason: "Usuario sin acceso activo." };\n    }\n`,
    `    if (tuErr) {\n      if (isCloudAvailabilityFailure(tuErr)) {\n        return assertCanWriteOffline(tenantId);\n      }\n      return { valid: false, reason: "No se pudo validar el usuario." };\n    }\n    if (!tu || tu.length === 0) {\n      await saveLicenseCache(tenantId, true, false);\n      return { valid: false, reason: "Usuario sin acceso activo." };\n    }\n`,
    'error usuario no equivale a bloqueo',
  )

  content = replaceOnce(
    content,
    `export async function shouldReadLocalFirst(\n  tenantId: string,\n  tableNames?: readonly LocalFirstMirrorTable[]\n): Promise<boolean> {\n  if (!isLocalFirstEnabled()) return false;\n  if (typeof navigator !== "undefined" && !navigator.onLine) return true;\n  if (isDesktopRuntime() && !(await isCloudAvailableForDesktop())) return true;\n  return await hasPendingLocalWrites(tenantId, tableNames);\n}\n`,
    `export async function shouldReadLocalFirst(\n  tenantId: string,\n  tableNames?: readonly LocalFirstMirrorTable[]\n): Promise<boolean> {\n  void tenantId;\n  void tableNames;\n  // The UI always reads the local mirror. Cloud and LAN workers update that mirror\n  // in the background; they never sit in the critical path of restaurant work.\n  if (isLocalFirstEnabled()) return true;\n  return false;\n}\n`,
    'lectura local siempre',
  )

  const lanFunctions = `\nexport async function syncLanEdge(tenantId: string): Promise<{ applied: number }> {\n  if (!getLanEdgeBaseUrl()) return { applied: 0 };\n  let applied = 0;\n  let hasMore = true;\n\n  while (hasMore) {\n    const pulled = await pullLanOutboxEntries(tenantId);\n    for (const event of pulled.events) {\n      const entry = event.entry;\n      if (!entry || entry.tenant_id !== tenantId || !isLocalFirstMirrorTable(entry.table_name)) continue;\n      const mutation = {\n        tenantId,\n        tableName: entry.table_name,\n        rowId: entry.row_id,\n        op: entry.op,\n        payload: entry.payload,\n      };\n      if (event.replicate_to_cloud) {\n        await writeLocalMutationAtomically(mutation, entry);\n      } else {\n        await applyLocalMirrorWrite(mutation);\n      }\n      applied += 1;\n    }\n    commitLanEdgeCursor(tenantId, pulled.nextCursor);\n    hasMore = pulled.hasMore;\n  }\n\n  return { applied };\n}\n\nexport async function publishLocalMirrorTableToLan(\n  tenantId: string,\n  tableName: LocalFirstMirrorTable,\n): Promise<number> {\n  if (!getLanEdgeBaseUrl()) return 0;\n  const rows = await readLocalMirror<Record<string, unknown>>(tenantId, tableName);\n  const deviceId = await getDeviceId();\n  let published = 0;\n\n  for (let offset = 0; offset < rows.length; offset += 200) {\n    const batch = rows.slice(offset, offset + 200).map((row) => {\n      const rowId = String(row["id"] ?? row["clave"] ?? "");\n      const version = String(row["updated_at"] ?? row["created_at"] ?? "0");\n      const entry = createSyncOutboxEntry({\n        tenantId,\n        tableName,\n        rowId,\n        op: "upsert",\n        payload: row,\n        deviceId,\n      });\n      entry.id = \`lan-snapshot:\${tenantId}:\${tableName}:\${rowId}:\${version}\`;\n      entry.status = "synced";\n      return entry;\n    }).filter((entry) => entry.row_id.length > 0);\n    await publishLanSnapshotEntries(batch);\n    published += batch.length;\n  }\n\n  return published;\n}\n`

  content = replaceAfter(
    content,
    `export async function readLocalOutbox`,
    `}\n\nexport async function hasPendingLocalWrites`,
    `}\n${lanFunctions}\nexport async function hasPendingLocalWrites`,
    'funciones LAN edge',
  )

  content = content.replace(
    `      if (existing?.completed) {\n        args.onTableDone?.(tableName, existing.row_count);\n        continue;\n      }`,
    `      if (existing?.completed) {\n        void publishLocalMirrorTableToLan(args.tenantId, tableName).catch(() => {});\n        args.onTableDone?.(tableName, existing.row_count);\n        continue;\n      }`,
  )
  content = content.replace(
    `      args.onTableDone?.(tableName, rowCount);\n    }`,
    `      void publishLocalMirrorTableToLan(args.tenantId, tableName).catch(() => {});\n      args.onTableDone?.(tableName, rowCount);\n    }`,
  )

  write(file, content)
}

function patchBootstrap() {
  const file = 'src/shared/hooks/useLocalFirstBootstrap.ts'
  let content = read(file)
  content = content.replace(
    `  assertCanWriteOffline,\n} from "../lib/localFirst";`,
    `  assertCanWriteOffline,\n  syncLanEdge,\n} from "../lib/localFirst";`,
  )

  content = replaceAfter(
    content,
    `const syncOnlineState = async`,
    `      if (!canContinue()) return;\n      const snapshot = await getLocalFirstStatusSnapshot(validatedTenantId);`,
    `      if (!canContinue()) return;\n      try {\n        await syncLanEdge(validatedTenantId);\n      } catch (error) {\n        console.warn("No se pudo sincronizar por LAN todavía:", error);\n      }\n      if (!canContinue()) return;\n      const snapshot = await getLocalFirstStatusSnapshot(validatedTenantId);`,
    'pull LAN antes de cloud',
  )

  content = replaceAfter(
    content,
    `const intervalId = window.setInterval`,
    `    const intervalId = window.setInterval(() => {\n      void syncOnlineState(false);\n    }, 15000);`,
    `    const intervalId = window.setInterval(() => {\n      void syncOnlineState(false);\n    }, 15000);\n    const lanIntervalId = window.setInterval(() => {\n      void syncLanEdge(validatedTenantId).catch((error) => {\n        console.warn("Sincronización LAN pendiente:", error);\n      });\n    }, 2000);`,
    'intervalo LAN',
  )

  content = content.replace(
    `      window.clearInterval(intervalId);`,
    `      window.clearInterval(intervalId);\n      window.clearInterval(lanIntervalId);`,
  )

  write(file, content)
}

function patchElectronMain() {
  const file = 'electron/main.ts'
  let content = read(file)
  content = content.replace(
    `import { setupAutoUpdater } from './autoUpdater'`,
    `import { setupAutoUpdater } from './autoUpdater'\nimport { startLanEdgeServer, type LanEdgeServerHandle } from './lanEdgeServer'`,
  )
  content = content.replace(
    `let mainWindow: BrowserWindow | null = null`,
    `let mainWindow: BrowserWindow | null = null\nlet lanEdgeServer: LanEdgeServerHandle | null = null`,
  )
  content = content.replace(
    `  app.whenReady().then(() => {\n    createWindow()`,
    `  app.whenReady().then(async () => {\n    try {\n      lanEdgeServer = await startLanEdgeServer({\n        dataDir: app.getPath('userData'),\n        distDir: path.join(__dirname, '../dist'),\n      })\n    } catch (error) {\n      console.error('[Cloudix LAN Edge] no pudo iniciar:', error)\n    }\n\n    createWindow()`,
  )
  content = content.replace(
    `  app.on('window-all-closed', () => {`,
    `  app.on('before-quit', () => {\n    void lanEdgeServer?.close()\n    lanEdgeServer = null\n  })\n\n  app.on('window-all-closed', () => {`,
  )
  write(file, content)
}

function patchAppLayout() {
  const file = 'src/app/components/AppLayout.tsx'
  let content = read(file)
  content = content.replace(
    `import { getLocalTenantPaymentDay } from "../../shared/lib/localFirst";`,
    `import { getLocalTenantPaymentDay, readLocalMirror, shouldReadLocalFirst } from "../../shared/lib/localFirst";`,
  )
  content = replaceOnce(
    content,
    `    let cancelled = false;\n    insforgeClient.database\n      .from("cocina_estado")\n      .select("activa")\n      .eq("tenant_id", tenantId)\n      .limit(1)\n      .then(({ data, error }) => {\n        if (cancelled) return;\n        if (!error && data?.[0]) {\n          setCocinaActiva(data[0].activa);\n        }\n      });\n`,
    `    let cancelled = false;\n    void (async () => {\n      try {\n        const useLocal = await shouldReadLocalFirst(tenantId, ["cocina_estado"]);\n        if (useLocal) {\n          const rows = await readLocalMirror<{ activa?: boolean }>(tenantId, "cocina_estado");\n          if (!cancelled && rows[0]) setCocinaActiva(rows[0].activa !== false);\n          return;\n        }\n        const { data, error } = await insforgeClient.database\n          .from("cocina_estado")\n          .select("activa")\n          .eq("tenant_id", tenantId)\n          .limit(1);\n        if (!cancelled && !error && data?.[0]) setCocinaActiva(data[0].activa);\n      } catch (error) {\n        console.warn("No se pudo leer el estado de cocina:", error);\n      }\n    })();\n`,
    'estado cocina local',
  )
  write(file, content)
}

function patchLocalFirstPlan() {
  const file = 'docs/local-first-plan.md'
  let content = read(file)
  content = content.replace(
    `InsForge autentica online. El dispositivo autoriza offline con sesion local y PIN.`,
    `InsForge autentica el primer acceso online. Después, el dispositivo conserva una sesión local validada y puede continuar sin PIN cuando la nube no está disponible.`,
  )
  content = content.replace(
    `4. Permitir bloqueo/desbloqueo local con PIN.\n5. Al reconectar, validar que \`tenant_users.activo\` y \`tenants.activa\` sigan vigentes.`,
    `4. Reutilizar automáticamente la sesión local del dispositivo cuando la nube no responda.\n5. Al reconectar, validar que \`tenant_users.activo\` y \`tenants.activa\` sigan vigentes.`,
  )
  content = content.replace(
    `| Bloquear caja | Mantiene sesion local y permite PIN offline |\n| Cerrar sesion total | Borra sesion local y exige internet para volver |`,
    `| Continuar sesión local | Mantiene la operación sin pedir PIN mientras el usuario no cierre sesión |\n| Cerrar sesión total | Borra la sesión local y exige internet para volver |`,
  )
  content = content.replace(
    `- [ ] Separar bloqueo local de logout total.\n- [ ] Reemplazar recordar password por PIN/hash local.`,
    `- [x] Mantener sesión local automática sin PIN cuando la nube no responde.\n- [x] Conservar cierre de sesión total como acción explícita del usuario.`,
  )
  write(file, content)
}

patchCloudAvailability()
patchUseAuth()
patchLocalFirst()
patchBootstrap()
patchElectronMain()
patchAppLayout()
patchLocalFirstPlan()
console.info('Migración true local-first aplicada correctamente.')
