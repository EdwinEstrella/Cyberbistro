// test/rls-example.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client as PgClient } from 'pg';

describe('Pruebas de Row Level Security (RLS) en Cloudix', () => {
  let db: PgClient | null = null;
  let isConnected = false;
  let skipReason = '';

  const TENANT_A_ID = '00000000-0000-0000-0000-000000000001';
  const TENANT_B_ID = '00000000-0000-0000-0000-000000000002';
  
  const USER_A_ID = '11111111-1111-1111-1111-111111111111';

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      skipReason = 'DATABASE_URL no definido; se omiten pruebas RLS dependientes de PostgreSQL.';
      return;
    }

    try {
      const { Client } = await import('pg');
      db = new Client({ connectionString: databaseUrl });
      await db.connect();
      isConnected = true;
      
      await db.query(`INSERT INTO tenants (id, nombre_negocio) VALUES ($1, 'Restaurante A') ON CONFLICT DO NOTHING`, [TENANT_A_ID]);
      await db.query(`INSERT INTO tenants (id, nombre_negocio) VALUES ($1, 'Restaurante B') ON CONFLICT DO NOTHING`, [TENANT_B_ID]);
      
      await db.query(`
        INSERT INTO tenant_users (id, tenant_id, auth_user_id, email, activo, password_hash, rol, nombre) 
        VALUES (gen_random_uuid(), $1, $2, 'usera@restaurantea.com', true, 'mockhash', 'admin', 'Usuario A')
        ON CONFLICT DO NOTHING
      `, [TENANT_A_ID, USER_A_ID]);

      await db.query(`INSERT INTO comandas (id, tenant_id, mesa_numero, estado) VALUES (gen_random_uuid(), $1, 5, 'abierta')`, [TENANT_A_ID]);
      await db.query(`INSERT INTO comandas (id, tenant_id, mesa_numero, estado) VALUES (gen_random_uuid(), $1, 10, 'abierta')`, [TENANT_B_ID]);
    } catch (e) {
      skipReason = `Base de datos RLS no disponible (${e instanceof Error ? e.message : 'error desconocido'}).`;
      console.warn(`${skipReason} Se saltará el test.`);
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (isConnected && db) await db.end();
  });

  it('El Usuario A SOLO puede ver las comandas del Restaurante A (Tenant A)', async (ctx) => {
    if (!isConnected || !db) {
      ctx.skip(skipReason || 'Pruebas RLS omitidas porque PostgreSQL no está disponible.');
      return;
    }

    // Empezamos transacción para poder usar SET LOCAL y no ensuciar el scope
    await db.query('BEGIN');
    
    // Perder los privilegios de Superusuario/Dueño bajando al rol de app
    await db.query('SET LOCAL ROLE authenticated');

    await db.query(`
      SELECT set_config('request.jwt.claims', 
        '{"sub": "${USER_A_ID}", "email": "usera@restaurantea.com"}', 
        true
      );
    `);

    const result = await db.query('SELECT * FROM comandas');
    
    // Devolver la conexión a la normalidad
    await db.query('ROLLBACK');

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].tenant_id).toBe(TENANT_A_ID);
  });
});
