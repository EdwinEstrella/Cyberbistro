import fs from 'fs';
import { createClient } from '@insforge/sdk';

const dest = createClient({
  baseUrl: 'https://9ytr56b9.us-east.insforge.app',
  anonKey: 'ik_0040035b7be38e044d449747bd128930'
});

const dataFile = JSON.parse(fs.readFileSync('restaurante-data.json', 'utf8'));
const tables = dataFile.data.tables;

const tableOrder = [
    'permission_catalog',
    'measurement_units',
    'cloudix_super_admins',
    'cyberbistro_super_admins',
    'tenants',
    'sucursales',
    'tenant_order_counters',
    'mesas_estado',
    'cocina_estado',
    'tenant_users',
    'proveedores',
    'customers',
    'gasto_categorias',
    'menu_categories',
    'productos_inventario',
    'platos',
    'recetas',
    'digital_menu_settings',
    'digital_menu_items',
    'compras',
    'compra_detalles',
    'gastos',
    'cierres_operativos',
    'comandas',
    'facturas',
    'consumos',
    'cuentas_pagar',
    'cuentas_cobrar',
    'cxp_pagos',
    'cxc_pagos',
    'digital_orders',
    'digital_order_items',
    'ecf_sequence_allocations',
    'ecf_batches',
    'ecf_documents',
    'ecf_document_events',
    'ecf_certificate_metadata',
    'ecf_e32_readiness_evidence',
    'fiscal_outbox',
    'inventario_movimientos',
    'produccion_cocina',
    'payments'
];

async function run() {
    for (const tableName of tableOrder) {
        if (!tables[tableName]) continue;
        const rows = tables[tableName].rows || [];
        if (rows.length === 0) continue;

        console.log(`Migrating ${tableName} (${rows.length} rows)...`);
        const BATCH_SIZE = 200; // Safe batch size
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const res = await dest.database.from(tableName).upsert(batch);
            if (res.error) {
                console.error(`Error migrating ${tableName} batch ${i}:`, res.error);
                // Exit or continue? Let's just log and continue to next table if it's a fatal structure error
                break; 
            }
        }
    }
    console.log('Migration finished successfully!');
}

run();
