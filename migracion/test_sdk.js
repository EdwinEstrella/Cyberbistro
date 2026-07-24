const { createClient } = require('@insforge/sdk');

const source = createClient('https://restaurante.azokia.com', 'ik_6x5cr7yb8h9m7c6v8t7yb9numi0oaisudhouaoc6tv7yb9nu');
const dest = createClient('https://9ytr56b9.us-east.insforge.app', 'ik_0040035b7be38e044d449747bd128930');

async function test() {
    const { data: sData, error: sErr } = await source.from('tenants').select('id').limit(1);
    console.log('Source:', sErr ? sErr : 'OK');
    
    const { data: dData, error: dErr } = await dest.from('tenants').select('id').limit(1);
    console.log('Dest:', dErr ? dErr : 'OK');
}
test();