const host = 'https://9ytr56b9.us-east.insforge.app';
const key = 'ik_0040035b7be38e044d449747bd128930';

async function test(path) {
    const res = await fetch(`${host}${path}tenants?limit=1`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    console.log(path, res.status);
}

async function run() {
    await test('/rest/v1/');
    await test('/api/rest/v1/');
    await test('/api/pg/');
    await test('/api/database/rest/v1/');
}
run();