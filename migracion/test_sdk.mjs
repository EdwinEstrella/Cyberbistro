import { createClient } from '@insforge/sdk';

const source = createClient({
  baseUrl: 'https://restaurante.azokia.com',
  anonKey: 'ik_6x5cr7yb8h9m7c6v8t7yb9numi0oaisudhouaoc6tv7yb9nu'
});
const dest = createClient({
  baseUrl: 'https://9ytr56b9.us-east.insforge.app',
  anonKey: 'ik_0040035b7be38e044d449747bd128930'
});

async function test() {
    const { data: sData, error: sErr } = await source.database.from('tenants').select('id').limit(1);
    console.log('Source:', sErr ? sErr : 'OK');
    
    const { data: dData, error: dErr } = await dest.database.from('tenants').select('id').limit(1);
    console.log('Dest:', dErr ? dErr : 'OK');
}
test();