const fs = require('fs');
const path = require('path');

const tenant_id = '002dae2e-cf46-48b0-8344-e181dcf4e786';
const sucursal_id = '79e87e59-f784-4534-9c72-f1efa3a4293d';

const categories = [
  { nombre: 'Chimis', color: '#ff906d', sort_order: 1 },
  { nombre: 'Hamburguesas', color: '#ff2d55', sort_order: 2 },
  { nombre: 'Hot-Dog & Sandwich', color: '#007aff', sort_order: 3 },
  { nombre: 'Carnes y algo más', color: '#f97316', sort_order: 4 },
  { nombre: 'Yaroas', color: '#bf5af2', sort_order: 5 },
  { nombre: 'Mexicanas', color: '#fb7185', sort_order: 6 },
  { nombre: 'Ensaladas', color: '#34c759', sort_order: 7 },
  { nombre: 'Bebidas', color: '#32d74b', sort_order: 8 }
];

const rawMenu = {
  'Chimis': [
    { name: 'Chimi normal', prices: [100, 175] },
    { name: 'Chimi pan de agua', prices: [125, 200] },
    { name: 'Chory chimi', prices: [200, 250] },
    { name: 'Chimi de pierna en pan', price: 225 },
    { name: 'Plato de pierna con pan', price: 300 },
    { name: 'Plato de pierna con papa', price: 350 },
    { name: 'Plato de pierna con fritos', price: 380 }
  ],
  'Hamburguesas': [
    { name: 'Hamburguesa normal', price: 200 },
    { name: 'Hamburguesa + papa', price: 250 },
    { name: 'DH Bacon Burger', prices: [230, 280] },
    { name: 'DH Cheese Burger', prices: [225, 275] },
    { name: 'DH Bacon Cheese', prices: [275, 325] },
    { name: 'DH Burger + Huevo', prices: [225, 275] },
    { name: 'DH Doble Burger', prices: [325, 375] },
    { name: 'DH Doble Cheese Burger', prices: [350, 400] },
    { name: 'DH Doble Bacon Burger', prices: [350, 400] },
    { name: 'DH Doble Bacon Cheese', prices: [375, 425] },
    { name: 'DH Doble Bacon Cheese + Huevo', prices: [400, 450] }
  ],
  'Hot-Dog & Sandwich': [
    { name: 'Hot dog normal', price: 100 },
    { name: 'Hot dog con carne molida', price: 125 },
    { name: 'Hot dog completo', price: 250 },
    { name: 'Club sandwich', price: 350 },
    { name: 'Tostada', prices: [65, 75] },
    { name: 'Sandwich de pollo', prices: [150, 200] }
  ],
  'Carnes y algo más': [
    { name: 'Salchipapas', prices: [150, 200, 300] },
    { name: 'Alitas fritas', prices: [275, 375] },
    { name: 'Pechuga a la plancha, fritos o papa', price: 350 },
    { name: 'Pechuga a la plancha + chorizo', price: 550 },
    { name: 'Chuleta frita con fritos o papas', price: 350 },
    { name: 'Chuleta y chorizo con fritos o papa', price: 450 },
    { name: 'Patacón pollo o res', price: 350 },
    { name: 'Patacón pierna', price: 400 },
    { name: 'Patacón mixto', price: 450 },
    { name: 'Patacón de 3 carnes', price: 475 },
    // Bola de mofongo is omitted as requested because it has no price
    { name: 'Servicio de papa', prices: [100, 150, 200] }
  ],
  'Yaroas': [
    { name: 'Yaroa de papas (pollo o res)', prices: [225, 325, 400] },
    { name: 'Yaroa de plátano maduro (pollo o res)', prices: [225, 325, 400] },
    { name: 'Yaroa de pierna (papas)', prices: [250, 350, 425] },
    { name: 'Yaroa de pierna (plátano maduro)', prices: [250, 350, 425] },
    { name: 'Yaroa mixta (papas)', prices: [275, 375, 475] },
    { name: 'Yaroa mixta (plátano maduro)', prices: [275, 375, 475] }
  ],
  'Mexicanas': [
    { name: 'Quesadillas de queso', prices: [225, 275] },
    { name: 'Quesadillas de pollo o res', prices: [275, 350] },
    { name: 'Quesadilla mixta', prices: [350, 400] },
    { name: 'Quesadilla de pierna', prices: [325, 375] },
    { name: 'Burritos pollo o res', prices: [250, 300] },
    { name: 'Burrito pierna', prices: [300, 350] },
    { name: 'Burrito mixto', prices: [350, 400] },
    { name: 'Burrito de pechuga a la plancha', prices: [350, 400] },
    { name: 'ChimiChanga', price: 300 }
  ],
  'Ensaladas': [
    { name: 'Ensalada César', price: 250 },
    { name: 'Ensalada César con pechuga a la plancha', price: 350 }
  ],
  'Bebidas': [
    { name: 'Agua', price: 25 },
    { name: 'Kola Real', price: 30 },
    { name: 'Coca-Cola', price: 35 },
    { name: 'Sprite', price: 35 },
    { name: 'Jugos Frutop', price: 35 },
    { name: 'Jugos naturales', price: 50 }
  ]
};

let sql = '';

sql += `-- Limpiar categorías y platos previos del tenant para evitar duplicados\n`;
sql += `DELETE FROM public.platos WHERE tenant_id = '${tenant_id}';\n`;
sql += `DELETE FROM public.menu_categories WHERE tenant_id = '${tenant_id}';\n\n`;

sql += `-- Insertar Categorías\n`;
categories.forEach(cat => {
  sql += `INSERT INTO public.menu_categories (tenant_id, sucursal_id, nombre, color, sort_order) VALUES ('${tenant_id}', '${sucursal_id}', '${cat.nombre}', '${cat.color}', ${cat.sort_order});\n`;
});
sql += `\n`;

sql += `-- Insertar Platos\n`;
for (const [catName, items] of Object.entries(rawMenu)) {
  const va_a_cocina = catName !== 'Bebidas';
  
  items.forEach(item => {
    if (item.price !== undefined) {
      sql += `INSERT INTO public.platos (tenant_id, sucursal_id, nombre, precio, categoria, disponible, va_a_cocina) VALUES ('${tenant_id}', '${sucursal_id}', '${item.name}', ${item.price}, '${catName}', true, ${va_a_cocina});\n`;
    } else if (item.prices) {
      if (item.prices.length === 2) {
        sql += `INSERT INTO public.platos (tenant_id, sucursal_id, nombre, precio, categoria, disponible, va_a_cocina) VALUES ('${tenant_id}', '${sucursal_id}', '${item.name} (sin papa)', ${item.prices[0]}, '${catName}', true, ${va_a_cocina});\n`;
        sql += `INSERT INTO public.platos (tenant_id, sucursal_id, nombre, precio, categoria, disponible, va_a_cocina) VALUES ('${tenant_id}', '${sucursal_id}', '${item.name} (con papa)', ${item.prices[1]}, '${catName}', true, ${va_a_cocina});\n`;
      } else if (item.prices.length === 3) {
        sql += `INSERT INTO public.platos (tenant_id, sucursal_id, nombre, precio, categoria, disponible, va_a_cocina) VALUES ('${tenant_id}', '${sucursal_id}', '${item.name} (Pequeña)', ${item.prices[0]}, '${catName}', true, ${va_a_cocina});\n`;
        sql += `INSERT INTO public.platos (tenant_id, sucursal_id, nombre, precio, categoria, disponible, va_a_cocina) VALUES ('${tenant_id}', '${sucursal_id}', '${item.name} (Mediana)', ${item.prices[1]}, '${catName}', true, ${va_a_cocina});\n`;
        sql += `INSERT INTO public.platos (tenant_id, sucursal_id, nombre, precio, categoria, disponible, va_a_cocina) VALUES ('${tenant_id}', '${sucursal_id}', '${item.name} (Grande)', ${item.prices[2]}, '${catName}', true, ${va_a_cocina});\n`;
      }
    }
  });
}

fs.writeFileSync(path.join(__dirname, '../scratch_insert_menu.sql'), sql);
console.log('SQL generated successfully.');
