const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'vps_backup.sql');
if (!fs.existsSync(file)) {
  console.log("vps_backup.sql does not exist!");
  process.exit(0);
}

const content = fs.readFileSync(file, 'utf8');
const matches = [];
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.toUpperCase().includes('PRIMARY KEY')) {
    matches.push({ lineNum: idx + 1, content: line.trim() });
  }
});

console.log(`Found ${matches.length} lines with PRIMARY KEY in vps_backup.sql.`);
matches.slice(0, 10).forEach(m => {
  console.log(`Line ${m.lineNum}: ${m.content}`);
});
