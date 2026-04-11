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
$env:GH_TOKEN="ghp_xxxxxxxx"
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
