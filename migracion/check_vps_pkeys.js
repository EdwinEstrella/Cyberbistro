const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const restaurantePath = path.join(__dirname, '.insforge', 'restaurante.json');
const projectPath = path.join(__dirname, '.insforge', 'project.json');
const backupPath = path.join(__dirname, '.insforge', 'cloudix-backup.json');

try {
  fs.copyFileSync(restaurantePath, projectPath);
  const sql = `SELECT tc.table_name, c.column_name FROM information_schema.table_constraints tc JOIN information_schema.constraint_column_usage AS ccu USING (constraint_schema, constraint_name) JOIN information_schema.columns AS c ON c.table_schema = tc.constraint_schema AND c.table_name = tc.table_name AND c.column_name = ccu.column_name WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' ORDER BY tc.table_name`;
  const resultRaw = execSync(`npx @insforge/cli db query "${sql}" --json`, { encoding: 'utf8' });
  const result = JSON.parse(resultRaw);
  console.log(`Found ${result.rows.length} primary keys in VPS:`);
  result.rows.forEach(r => console.log(`  Table: ${r.table_name}, Column: ${r.column_name}`));
} catch (err) {
  console.error("Failed:", err.message);
} finally {
  fs.copyFileSync(backupPath, projectPath);
}
