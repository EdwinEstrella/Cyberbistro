import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

/** Carpetas de agentes/IDE con symlinks: en Windows EPERM al empaquetar si se copian. */
function ignoreDevSymlinkPaths(relativePath) {
  const p = relativePath.replace(/\\/g, '/');
  const segments = [
    '/.agents/',
    '/.claude/',
    '/.cursor/',
    '/.git/',
    '/agent-transcripts/',
  ];
  if (segments.some((s) => p.includes(s))) return true;
  if (/^\.agents(\/|$)/.test(p) || /^\.claude(\/|$)/.test(p)) return true;
  return false;
}

export default {
  packagerConfig: {
    asar: true,
    icon: './icon',
    extraResource: ['./icon.ico'],
    ignore: ignoreDevSymlinkPaths,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-wix',
      config: {
        name: 'Cyberbistro',
        manufacturer: 'Edwin',
        language: 3082, // Español
        icon: './icon.ico',
        ui: {
          chooseDirectory: true // Activa el wizard con selección de directorio
        }
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
