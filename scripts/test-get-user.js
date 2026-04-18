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
  console.log("Got refresh token. Creating a new client instance as if app restarted...");

  const client2 = createClient({
    baseUrl: FALLBACK_BASE_URL,
    anonKey: FALLBACK_ANON_KEY,
    isServerMode: true
  });
  client2.getHttpClient().setRefreshToken(refreshToken);

  console.log("Calling getCurrentUser...");
  const curr = await client2.auth.getCurrentUser();
  if (curr.error) console.log("getCurrentUser error:", curr.error);
  if (curr.data) console.log("getCurrentUser ok:", !!curr.data.user);

  // What is the status of tokenManager inside client2?
  // Is it possible to intercept the new token?
}
main().catch(console.error);
