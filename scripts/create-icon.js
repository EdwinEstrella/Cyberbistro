import sharp from 'sharp';
import fs from 'fs';

// SVG a PNG de múltiples tamaños
const sizes = [16, 32, 48, 64, 128, 256];

async function createIcon() {
  console.log('Generando icono...');

  // Crear PNGs de diferentes tamaños
  for (const size of sizes) {
    await sharp('icon.svg')
      .resize(size, size)
      .png()
      .toFile(`icon-${size}x${size}.png`);
    console.log(`Creado: icon-${size}x${size}.png`);
  }

  console.log('✅ PNGs creados. Ahora usa https://cloudconvert.com/png-to-ico para convertirlos a .ico');
  console.log('O instala "png-to-ico" globalmente: npm install -g png-to-ico');
}

createIcon().catch(console.error);
