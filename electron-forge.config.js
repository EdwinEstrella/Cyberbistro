module.exports = {
  packagerConfig: {
    name: 'Cyberbistro',
    executableName: 'cyberbistro',
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
    ],
    // Windows-specific configuration
    win32metadata: {
      CompanyName: 'Cyberbistro',
      FileDescription: 'Cyberbistro Desktop App',
      ProductName: 'Cyberbistro',
      InternalName: 'cyberbistro'
    }
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'cyberbistro',
        authors: 'Edwin',
        description: 'Cyberbistro Desktop App',
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
        name: 'Cyberbistro',
        manufacturer: 'Cyberbistro',
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