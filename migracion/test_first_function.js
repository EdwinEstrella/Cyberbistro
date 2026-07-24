const { execFileSync } = require('child_process');
const path = require('path');

const stmt = `
-- Functions and Procedures
-- Function: can_use_tenant_realtime_channel
CREATE OR REPLACE FUNCTION public.can_use_tenant_realtime_channel(p_tenant_id uuid, p_permission_key text DEFAULT 'realtime.domain_events.view'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.app_users au ON au.id = tm.app_user_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
      AND au.auth_user_id = auth.uid()
  ) AND public.check_user_permission(p_tenant_id, p_permission_key);
END;
$function$
;
`;

const cliPath = path.join(__dirname, 'node_modules', '@insforge', 'cli', 'dist', 'index.js');
try {
  console.log("Running statement...");
  const stdout = execFileSync('node', [cliPath, 'db', 'query', stmt], { encoding: 'utf8' });
  console.log("Success! Output:", stdout);
} catch (err) {
  console.error("Failed!");
  console.error("Status:", err.status);
  console.error("Stdout:", err.stdout);
  console.error("Stderr:", err.stderr);
}
