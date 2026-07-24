const fs = require('fs');
const content = fs.readFileSync('migracion/vps_constraints.sql', 'utf8');

const matches = [];
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.toUpperCase().includes('INSERT')) {
    matches.push({ lineNum: idx + 1, content: line.trim() });
  }
});

console.log(`Found ${matches.length} lines with INSERT in vps_constraints.sql:`);
matches.slice(0, 10).forEach(m => {
  console.log(`Line ${m.lineNum}: ${m.content}`);
});
