const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const restaurantePath = path.join(__dirname, '.insforge', 'restaurante.json');
const projectPath = path.join(__dirname, '.insforge', 'project.json');
const backupPath = path.join(__dirname, '.insforge', 'cloudix-backup.json');

try {
  fs.copyFileSync(restaurantePath, projectPath);
  const result = execSync(`npx @insforge/cli db query "SELECT count(*) FROM public.tenants" --json`, { encoding: 'utf8' });
  console.log("VPS Response:", result);
} catch (err) {
  console.error("VPS is not responding:", err.message);
  if (err.stdout) console.log("Stdout:", err.stdout);
  if (err.stderr) console.log("Stderr:", err.stderr);
} finally {
  fs.copyFileSync(backupPath, projectPath);
}
