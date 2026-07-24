const { execSync } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, 'node_modules', '@insforge', 'cli', 'dist', 'index.js');

try {
  console.log("Dropping and recreating public schema in Cloud database...");
  execSync(`node "${cliPath}" db query "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`, { encoding: 'utf8' });
  console.log("✓ Public schema reset successfully!");
} catch (err) {
  console.error("Reset failed:", err.message);
  if (err.stdout) console.log("Stdout:", err.stdout);
  if (err.stderr) console.log("Stderr:", err.stderr);
}
