const fs = require('fs');
const content = fs.readFileSync('vps_backup.sql', 'utf8');
const parsed = JSON.parse(content);
console.log("Keys in backup JSON:", Object.keys(parsed));
if (parsed.metadata) {
  console.log("Metadata keys:", Object.keys(parsed.metadata));
}
if (parsed.schema) {
  console.log("Schema keys:", Object.keys(parsed.schema));
}
