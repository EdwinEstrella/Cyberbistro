const fs = require('fs');
const content = fs.readFileSync('vps_backup_raw.sql', 'utf8');

const matches = [];
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('function') && (line.toLowerCase().includes('cloudix') || line.toLowerCase().includes('cyberbistro'))) {
    matches.push({ lineNum: idx + 1, content: line.trim() });
  }
});

console.log(`Found ${matches.length} lines with cloudix_auth_user_id:`);
matches.slice(0, 10).forEach(m => {
  console.log(`Line ${m.lineNum}: ${m.content}`);
});
