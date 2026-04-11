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

## Windows: firma y metadatos del .exe

En este proyecto `build.win.signAndEditExecutable` está en `false` para evitar que `electron-builder` extraiga la herramienta `winCodeSign` en equipos sin permiso para crear symlinks (sin modo desarrollador de Windows). Si necesitas icono y metadatos incrustados en el `.exe` vía rcedit, activa el modo desarrollador en Windows o ejecuta el build en un entorno que permita symlinks y vuelve a poner `signAndEditExecutable` en `true`.

Para distribución pública, conviene un certificado de firma de código (Authenticode) y configurar `CSC_LINK` / `CSC_KEY_PASSWORD` según la [documentación de electron-builder](https://www.electron.build/code-signing).

## MSI con Electron Forge

El script `npm run make` sigue generando MSI con WiX; ese artefacto no es el que consume `electron-updater` en Windows (el canal de auto-actualización es el NSIS `.exe` de `dist:win` / `release:win`).

## Instalador NSIS: “Siguiente” cierra la ventana

**Modo actual:** asistente **multipágina** (`oneClick: false`, `allowToChangeInstallationDirectory: true`). Tras **Siguiente** en la bienvenida deberías ver la carpeta de destino, luego la barra de progreso y la pantalla de finalización (con opción de ejecutar la app si `runAfterFinish` está activo).

Si antes usabas **one-click** (`oneClick: true`), el primer **Siguiente** a veces **inicia la instalación y cierra el asistente al momento**; puede parecer un fallo aunque la app se haya instalado. Comprueba menú Inicio / escritorio.

Si con el asistente multipágina la ventana se cierra en el **primer** Siguiente y no aparece la carpeta de instalación:

1. Prueba `release\win-unpacked\Cyberbistro.exe` (sin instalador). Si funciona, sospecha de antivirus o SmartScreen sobre el `.exe` del setup.
2. Ejecuta el instalador como administrador (clic derecho → Ejecutar como administrador).
3. Logs de la app tras instalar: `%USERPROFILE%\AppData\Roaming\Cyberbistro\logs\`.

Para volver al instalador mínimo de una sola acción, en `package.json` → `build.nsis` pon `oneClick: true` y `allowToChangeInstallationDirectory: false`.
