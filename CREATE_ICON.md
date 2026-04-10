# Crear Icono para Windows

## Método Rápido (Online)

1. Ve a: https://cloudconvert.com/svg-to-ico
2. Sube `icon.svg`
3. Descarga `icon.ico`
4. Mueve `icon.ico` a la raíz del proyecto (donde está `main.js`)

## Método con Node.js

1. Instala las dependencias:
```bash
npm install --save-dev sharp png-to-ico
```

2. Crea los PNGs:
```bash
node scripts/create-icon.js
```

3. Crea el ICO:
```bash
# En la terminal de Node.js
node -e "const PngToIco = require('png-to-ico'); const fs = require('fs'); PngToIco(['icon-16x16.png', 'icon-32x32.png', 'icon-48x48.png', 'icon-256x256.png']).then(buf => fs.writeFileSync('icon.ico', buf));"
```

## Después de crear icon.ico

El `main.js` ya está configurado para usarlo:
```javascript
icon: path.join(__dirname, 'icon.ico'),
```

Reinicia la app y verás el icono en:
- Barra de tareas de Windows
- Administrador de tareas
- Explorador de archivos
