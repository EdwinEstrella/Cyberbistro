const fs = require('fs');
const content = fs.readFileSync('vps_backup.sql', 'utf8');
const parsed = JSON.parse(content);
fs.writeFileSync('vps_backup_raw.sql', parsed.data, 'utf8');
console.log("Extracted raw SQL to vps_backup_raw.sql. Size in bytes:", parsed.data.length);
