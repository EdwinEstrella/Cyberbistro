const fs = require('fs');
const content = fs.readFileSync('vps_backup_raw.sql', 'utf8');

const matches = [];
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.toUpperCase().includes('PRIMARY')) {
    matches.push({ lineNum: idx + 1, content: line.trim() });
  }
});

console.log(`Found ${matches.length} lines with PRIMARY.`);
matches.slice(0, 10).forEach(m => {
  console.log(`Line ${m.lineNum}: ${m.content}`);
});
