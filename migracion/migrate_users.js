const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const restaurantePath = path.join(__dirname, '.insforge', 'restaurante.json');
const projectPath = path.join(__dirname, '.insforge', 'project.json');
const backupPath = path.join(__dirname, '.insforge', 'cloudix-backup.json');

function runCmd(cmd) {
  return execSync(cmd, { encoding: 'utf8' });
}

try {
  console.log("1. Switching CLI to VPS database (restaurante.json)...");
  fs.copyFileSync(restaurantePath, projectPath);
  
  console.log("2. Querying all users from VPS database...");
  const usersResultRaw = runCmd('npx @insforge/cli db query "SELECT * FROM auth.users" --json');
  const usersResult = JSON.parse(usersResultRaw);
  console.log(`Found ${usersResult.rows.length} users in VPS.`);

  console.log("3. Restoring CLI to Cloud database (cloudix-backup.json)...");
  fs.copyFileSync(backupPath, projectPath);

  console.log("4. Inserting users into Cloud database...");
  for (const user of usersResult.rows) {
    console.log(`Inserting user: ${user.email} (${user.id})`);
    
    // Helper to format values for raw SQL insert
    const formatVal = (val, type) => {
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
      if (typeof val === 'boolean') return val ? 'true' : 'false';
      return `'${String(val).replace(/'/g, "''")}'`;
    };

    const columns = Object.keys(user);
    const values = columns.map(col => formatVal(user[col]));
    
    const insertSql = `INSERT INTO auth.users (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password, profile = EXCLUDED.profile, metadata = EXCLUDED.metadata`;
    
    try {
      runCmd(`npx @insforge/cli db query "${insertSql.replace(/"/g, '\\"')}"`);
      console.log(`✓ Inserted/Updated: ${user.email}`);
    } catch (err) {
      console.error(`✗ Failed inserting user ${user.email}:`, err.message);
    }
  }

  console.log("User migration complete!");
} catch (err) {
  console.error("Migration failed:", err);
  // Restore project.json just in case
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, projectPath);
  }
}
