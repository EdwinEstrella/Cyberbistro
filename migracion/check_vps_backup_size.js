const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'migracion', 'vps_backup_raw.sql');
if (!fs.existsSync(file)) {
  console.log("vps_backup_raw.sql not found in migracion/!");
  process.exit(0);
}

const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');
console.log("Total lines:", lines.length);
console.log("Last 100 lines of file:");
console.log(lines.slice(-100).join('\n'));
