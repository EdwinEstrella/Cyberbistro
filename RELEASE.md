# Publicar Cyberbistro (NSIS + auto-actualización)

## Requisitos

- Cuenta de GitHub con permisos en el repo configurado en `package.json` → `build.publish` (actualmente `EdwinEstrella/Cyberbistro`).
- Un [Personal Access Token](https://github.com/settings/tokens) con alcance **repo** para subir releases (variable de entorno `GH_TOKEN`).

## Generar el instalador .exe localmente (sin subir)

```bash
npm run dist:win
```

Salida en la carpeta `release/`: instalador NSIS (`.exe`), `latest.yml` y archivos asociados que `electron-updater` usa en GitHub Releases.

## Publicar una nueva versión en GitHub

1. Incrementa `"version"` en `package.json` (debe coincidir con el tag de la release).
2. Ejecuta en PowerShell (sustituye el token):

```powershell
$env:GH_TOKEN="ghp_TU_TOKEN_AQUI"
npm run release:win
```

Esto ejecuta `vite build` y `electron-builder --win --publish always`, creando o actualizando el release en GitHub con el `.exe` y `latest.yml`.

## Comportamiento en la app empaquetada

- A los ~3 segundos de abrir la app instalada (build de `electron-builder`), se llama a `checkForUpdates`.
- Si hay versión nueva en GitHub, se descarga en segundo plano y se muestra el flujo de toasts / confirmación de reinicio.

## Windows: firma, icono en el .exe y `winCodeSign`

`build.win.signAndEditExecutable` está en **`false`** en este repo para evitar fallos al extraer `winCodeSign` cuando Windows no permite **enlaces simbólicos** (sin modo desarrollador). En ese modo el `.exe` puede mostrar el icono genérico de Electron en el explorador; la ventana de la app sigue usando `icon.ico` desde `extraResources`. Para incrustar icono en el ejecutable, pon `signAndEditExecutable` en `true` y activa el modo desarrollador o construye en un entorno con symlinks.

Para distribución pública, conviene un certificado de firma de código (Authenticode) y configurar `CSC_LINK` / `CSC_KEY_PASSWORD` según la [documentación de electron-builder](https://www.electron.build/code-signing).

## Electron main (CJS) y Vite

El `package.json` de la app **no** usa `"type": "module"`, para que `vite-plugin-electron` genere `dist-electron/main.js` en formato **CommonJS** (`require`), alineado con `electron-updater` / `electron-log`. La configuración de Vite vive en **`vite.config.mts`** (ESM) para poder cargar plugins solo-ESM como `@tailwindcss/vite`.

## MSI con Electron Forge

El script `npm run make` sigue generando MSI con WiX; ese artefacto no es el que consume `electron-updater` en Windows (el canal de auto-actualización es el NSIS `.exe` de `dist:win` / `release:win`).

## Instalador NSIS: “Siguiente” cierra la ventana

**Modo actual:** asistente **multipágina** (`oneClick: false`, `allowToChangeInstallationDirectory: true`). El script `build/installer.nsh` define **`RequestExecutionLevel admin`**: al abrir el instalador Windows pedirá elevación (como ejecutar como administrador) y suele evitar que el asistente se cierre al pulsar Siguiente.

Tras **Siguiente** en la bienvenida deberías ver la carpeta de destino, luego la barra de progreso y la pantalla de finalización (con opción de ejecutar la app si `runAfterFinish` está activo).

Si aun así falla: prueba `release\win-unpacked\Cyberbistro.exe`, revisa antivirus/SmartScreen, y los logs en `%USERPROFILE%\AppData\Roaming\Cyberbistro\logs\`.

Para volver al instalador mínimo de una sola acción, en `package.json` → `build.nsis` pon `oneClick: true` y `allowToChangeInstallationDirectory: false` (y quita o ajusta `include` si no quieres UAC al instalar).
