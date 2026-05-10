import { createClient } from '@insforge/sdk';
import { readFileSync } from 'fs';

const opencodeStr = readFileSync('opencode.json', 'utf-8');
const opencode = JSON.parse(opencodeStr);

const supabase = createClient({ baseUrl: opencode.mcp.insforge.environment.API_BASE_URL, anonKey: opencode.mcp.insforge.environment.API_KEY, isServerMode: true });

async function run() {
  const adminEmail = "dmole@gmail.com";
  const adminPassword = "123456"; // Assuming this is correct from test-login.js

  console.log("Signing in as admin...");
  const { data: adminAuth, error: adminErr } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });

  if (adminErr) {
    console.error("Admin signin failed:", adminErr.message);
    return;
  }
  
  // Get tenant ID
  const { data: tu, error: tuErr } = await supabase.database.from('tenant_users')
    .select('tenant_id')
    .eq('email', adminEmail)
    .single();
    
  if (tuErr) {
    console.error("Failed to get tenant_id:", tuErr.message);
    return;
  }
  const tenantId = tu.tenant_id;
  console.log("Got tenant ID:", tenantId);

  const staffEmail = `test_cajera_${Date.now()}@example.com`;
  const staffPassword = "password123";

  console.log("Signing up new staff:", staffEmail);
  const { data: signData, error: authError } = await supabase.auth.signUp({
    email: staffEmail,
    password: staffPassword,
  });

  if (authError) {
    console.error("SignUp error:", authError.message);
    return;
  }
  
  const newUserId = signData.user.id;
  console.log("New user ID:", newUserId);

  console.log("Signing out...");
  await supabase.auth.signOut();

  console.log("Signing back in as admin...");
  const { error: reinError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });

  if (reinError) {
    console.error("Re-signin error:", reinError.message);
    return;
  }

  console.log("Inserting into tenant_users...");
  const { error: insertError } = await supabase.database.from('tenant_users').insert([{
    auth_user_id: newUserId,
    tenant_id: tenantId,
    email: staffEmail,
    password_hash: "MANAGED_BY_AUTH",
    rol: "cajera",
    nombre: "Test Cajera",
    activo: true
  }]);

  if (insertError) {
    console.error("INSERT ERROR:", insertError.message, insertError.details, insertError.hint);
  } else {
    console.log("SUCCESS! User created and inserted.");
  }
}

run();
