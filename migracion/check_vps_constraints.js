const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const restaurantePath = path.join(__dirname, '.insforge', 'restaurante.json');
const projectPath = path.join(__dirname, '.insforge', 'project.json');
const backupPath = path.join(__dirname, '.insforge', 'cloudix-backup.json');

try {
  fs.copyFileSync(restaurantePath, projectPath);
  const sql = `SELECT c.conname, c.contype, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'`;
  const resultRaw = execSync(`npx @insforge/cli db query "${sql}" --json`, { encoding: 'utf8' });
  const result = JSON.parse(resultRaw);
  console.log(`Found ${result.rows.length} constraints in VPS:`);
  result.rows.slice(0, 20).forEach(r => console.log(`  Name: ${r.conname}, Type: ${r.contype}, Def: ${r.pg_get_constraintdef}`));
} catch (err) {
  console.error("Failed:", err.message);
} finally {
  fs.copyFileSync(backupPath, projectPath);
}
