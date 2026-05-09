const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

/** Carpetas de agentes/IDE con symlinks: en Windows EPERM al empaquetar si se copian. */
function ignoreDevSymlinkPaths(relativePath) {
  const p = relativePath.replace(/\\/g, '/');
  const segments = [
    '/.agents/',
    '/.claude/',
    '/.cursor/',
    '/.git/',
    '/agent-transcripts/',
    '/website/',
  ];
  if (segments.some((s) => p.includes(s))) return true;
  if (/^\.agents(\/|$)/.test(p) || /^\.claude(\/|$)/.test(p)) return true;
  return false;
}

module.exports = {
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
        name: 'Cloudix',
        manufacturer: 'Edwin',
        language: 3082,
        icon: './icon.ico',
        ui: {
          chooseDirectory: true,
        },
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
