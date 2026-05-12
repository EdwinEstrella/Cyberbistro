async function main() {
  const { createClient } = await import('@insforge/sdk');
  const FALLBACK_BASE_URL = 'https://restaurante.azokia.com';
  const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDAxMzF9.OQwbEoWPtw-inbXdU3D7c39RZn3c87FJ-HvMBF_jrn4';

  const client = createClient({
    baseUrl: FALLBACK_BASE_URL,
    anonKey: FALLBACK_ANON_KEY,
    isServerMode: true
  });

  console.log("Calling login...");
  const res = await client.auth.signInWithPassword({
    email: "dmole@gmail.com",
    password: "123456"
  });

  console.log("Error:", res.error);
  if (res.data) {
    console.log("Data keys:", Object.keys(res.data));
    console.log("User:", res.data.user);
    console.log("Has access token:", Boolean(res.data.accessToken));
    console.log("Has refresh token:", Boolean(res.data.refreshToken));
  }
}
main().catch(console.error);
