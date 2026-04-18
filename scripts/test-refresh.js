async function main() {
  const { createClient } = await import('@insforge/sdk');
  const FALLBACK_BASE_URL = 'https://restaurante.azokia.com';
  const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDAxMzF9.OQwbEoWPtw-inbXdU3D7c39RZn3c87FJ-HvMBF_jrn4';

  const client = createClient({
    baseUrl: FALLBACK_BASE_URL,
    anonKey: FALLBACK_ANON_KEY,
    isServerMode: true
  });

  const rnd = Math.floor(Math.random() * 10000);
  const signData = await client.auth.signUp({
    email: `dmole@gmail.com`,
    password: "123456"
  });

  const refreshToken = signData.data.refreshToken;
  console.log("Got refresh token. Now trying to refreshSession...");

  const ref = await client.auth.refreshSession({ refreshToken });
  if (ref.error) console.log("Refresh Error:", ref.error);
  if (ref.data) console.log("Refresh success, data keys:", Object.keys(ref.data));
}
main().catch(console.error);
