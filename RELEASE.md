# Publicar Cloudix (NSIS + auto-actualización)

## Requisitos

- Cuenta de GitHub con permisos en el repo configurado en `package.json` → `build.publish` (actualmente `EdwinEstrella/Cloudix`).
- Un [Personal Access Token](https://github.com/settings/tokens) con alcance **repo** para subir releases (variable de entorno `GH_TOKEN` o `GITHUB_TOKEN`).

## Generar el instalador .exe localmente (sin subir)

```bash
npm run dist:win
```

URL// https://github.com/EdwinEstrella/Cloudix/releases/latest/download/Cloudix-Install.exe

Salida en la carpeta `release/`: instalador NSIS (`.exe`), `latest.yml` y archivos asociados que `electron-updater` usa en GitHub Releases.

## Publicar una nueva versión en GitHub (release **Latest**)

GitHub marca como **Latest** el release más reciente que **no** sea borrador ni *prerelease*. Esta app publica con `releaseType: "release"` y tag `vX.Y.Z` (`vPrefixedTagName: true` en `package.json`), así que cada `release:win` exitoso deja ese release como candidato a Latest si la versión en `package.json` es la semver más alta del repo.

### Checklist rápido

1. **Subir la versión** (elige una opción):
   - `npm version patch --no-git-tag-version` → incrementa `1.0.x` en `package.json` y `package-lock.json`, o
   - `npm version minor` / `npm version major` si también querés commit + tag automáticos en git.
2. **Commit** de `package.json` / `package-lock.json` (y `RELEASE.md` si lo tocás) y **push** a la rama principal cuando corresponda.
3. **Publicar artefactos** (instalador + `latest.yml`):

```powershell
$env:GH_TOKEN="ghp_TU_TOKEN_AQUI"   # o GITHUB_TOKEN; fine-grained PAT con repo + releases
npm run release:win
```

**Comando exacto:** equivale a `npm run icon:build && npm run build && electron-builder --win --publish always`.

**Nota:** `gh auth login` no sustituye al token; `electron-builder` usa **`GH_TOKEN`** o **`GITHUB_TOKEN`**. Sin token, el build local puede terminar pero la subida a GitHub falla.

**Auto-actualización:** las apps instaladas consultan `latest.yml` del release Latest; al publicar una versión nueva, los usuarios con versión anterior recibirán la actualización según el flujo de `electron-updater` en la app.

## Comportamiento en la app empaquetada

- A los ~3 segundos de abrir la app instalada (build de `electron-builder`), se llama a `checkForUpdates`.
- Si hay versión nueva en GitHub, se descarga en segundo plano y se muestra el flujo de toasts / confirmación de reinicio.

## Windows: firma, icono en el .exe y `winCodeSign`

`build.win.signAndEditExecutable` está en **`false`** en este repo para evitar fallos al extraer `winCodeSign` cuando Windows no permite **enlaces simbólicos** (sin modo desarrollador). Sin el paso de edición del binario, el `.exe` principal puede quedar con el icono por defecto de Electron en el Explorador aunque NSIS sí use tu `icon.ico` en instalador y desinstalador. Para compensarlo, el hook **`build.afterPack`** (`scripts/after-pack-win-icon.cjs`) aplica `icon.ico` al ejecutable con **`rcedit`**, sin reactivar `winCodeSign`. Alternativa: pon `signAndEditExecutable` en `true` y activa el modo desarrollador o construye donde existan symlinks.

Para distribución pública, conviene un certificado de firma de código (Authenticode) y configurar `CSC_LINK` / `CSC_KEY_PASSWORD` según la [documentación de electron-builder](https://www.electron.build/code-signing).

## Electron main (CJS) y Vite

El `package.json` de la app **no** usa `"type": "module"`, para que `vite-plugin-electron` genere `dist-electron/main.js` en formato **CommonJS** (`require`), alineado con `electron-updater` / `electron-log`. La configuración de Vite vive en **`vite.config.mts`** (ESM) para poder cargar plugins solo-ESM como `@tailwindcss/vite`.

## MSI con Electron Forge

El script `npm run make` sigue generando MSI con WiX; ese artefacto no es el que consume `electron-updater` en Windows (el canal de auto-actualización es el NSIS `.exe` de `dist:win` / `release:win`).

## Instalador NSIS: “Siguiente” cierra la ventana

**Modo actual:** asistente **multipágina** (`oneClick: false`, `allowToChangeInstallationDirectory: true`). El script `build/installer.nsh` define **`RequestExecutionLevel admin`**: al abrir el instalador Windows pedirá elevación (como ejecutar como administrador) y suele evitar que el asistente se cierre al pulsar Siguiente.

Tras **Siguiente** en la bienvenida deberías ver la carpeta de destino, luego la barra de progreso y la pantalla de finalización (con opción de ejecutar la app si `runAfterFinish` está activo).

Si aun así falla: prueba `release\win-unpacked\Cloudix.exe`, revisa antivirus/SmartScreen, y los logs en `%USERPROFILE%\AppData\Roaming\Cloudix\logs\`.

Para volver al instalador mínimo de una sola acción, en `package.json` → `build.nsis` pon `oneClick: true` y `allowToChangeInstallationDirectory: false` (y quita o ajusta `include` si no quieres UAC al instalar).
