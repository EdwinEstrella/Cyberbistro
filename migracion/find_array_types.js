const fs = require('fs');
const content = fs.readFileSync('vps_backup_raw.sql', 'utf8');

const regex = /CREATE TABLE [\s\S]+?\);/gi;
const matches = content.match(regex);
if (matches) {
  matches.forEach(m => {
    if (m.includes(' ARRAY')) {
      console.log("--- Found ARRAY column in table definition ---");
      console.log(m);
    }
  });
}
