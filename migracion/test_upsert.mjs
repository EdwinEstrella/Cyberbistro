import { createClient } from '@insforge/sdk';
const dest = createClient({ baseUrl: 'https://9ytr56b9.us-east.insforge.app', anonKey: 'ik_0040035b7be38e044d449747bd128930' });

async function test() {
    const res = await dest.database.from('tenants').upsert([{ id: '2a547d0e-4a0b-49e5-a7be-34071934c61d', nombre_negocio: 'Test' }]);
    console.log(res.error ? res.error : 'UPSERT OK');
}
test();