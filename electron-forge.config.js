module.exports = {
  packagerConfig: {
    name: 'Cloudix',
    executableName: 'cloudix',
    icon: './icon', // Sin extensión - Forge agrega .ico automáticamente
    asar: true,
    // Include only necessary files
    ignore: [
      /^\/\.agents/,
      /^\/\.claude/,
      /^\/\.git/,
      /^\/node_modules\/\.cache/,
      /^\/out/,
      /^\/dist\/.*\.map$/,
      /^\/dist-electron\/.*\.map$/,
      /^\/src/,
      /^\/electron\/.+\.(ts|tsx)$/,
      /^\/vite\.config\.ts/,
      /^\/tailwind\.config\./,
      /^\/tsconfig\.json/,
      /^\/Diseño/,
      /^\/CREATE_ICON\.md/,
      /^\/CLAUDE\.md/,
      /^\/README\.md/,
      /^\/package-lock\.json/,
      /^\/yarn\.lock/,
      /^\/pnpm-lock\.yaml/,
      /^\/SOLUCION_ICONO\.md/,
      /^\/website/,
    ],
    // Windows-specific configuration
    win32metadata: {
      CompanyName: 'Cloudix',
      FileDescription: 'Cloudix Desktop App',
      ProductName: 'Cloudix',
      InternalName: 'cloudix'
    }
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'cloudix',
        authors: 'Edwin',
        description: 'Cloudix Desktop App',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
    {
      name: '@electron-forge/maker-wix',
      config: {
        name: 'Cloudix',
        manufacturer: 'Cloudix',
        // El instalador usa el icono del .exe empaquetado (definido en packagerConfig.icon)
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
}