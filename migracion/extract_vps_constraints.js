const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const restaurantePath = path.join(__dirname, '.insforge', 'restaurante.json');
const projectPath = path.join(__dirname, '.insforge', 'project.json');
const backupPath = path.join(__dirname, '.insforge', 'cloudix-backup.json');

try {
  // Switch to VPS config
  fs.copyFileSync(restaurantePath, projectPath);
  
  const cliPath = path.join(__dirname, 'node_modules', '@insforge', 'cli', 'dist', 'index.js');
  const sql = `SELECT c.conname as name, c.contype as type, pg_get_constraintdef(c.oid) as def, c.conrelid::regclass::text as tbl FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'`;
  
  const resultRaw = execSync(`node "${cliPath}" db query "${sql}" --json`, { encoding: 'utf8' });
  const result = JSON.parse(resultRaw);
  
  const sqlStatements = [];
  result.rows.forEach(r => {
    // Generate ALTER TABLE statement
    // Note: pg_get_constraintdef(c.oid) returns the full definition like "PRIMARY KEY (id)" or "FOREIGN KEY (tenant_id) REFERENCES tenants(id)"
    sqlStatements.push(`ALTER TABLE public.${r.tbl} ADD CONSTRAINT ${r.name} ${r.def};`);
  });
  
  fs.writeFileSync('vps_constraints.sql', sqlStatements.join('\n'), 'utf8');
  console.log(`Successfully extracted ${sqlStatements.length} constraints to vps_constraints.sql`);
  
} catch (err) {
  console.error("Extraction failed:", err.message);
  if (err.stdout) console.log("Stdout:", err.stdout);
  if (err.stderr) console.log("Stderr:", err.stderr);
} finally {
  // Restore Cloud config
  fs.copyFileSync(backupPath, projectPath);
}
