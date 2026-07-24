const fs = require('fs');
const path = require('path');

// We need the splitSQL function from import_sql_ordered.js
function splitSQL(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = null;
  let inSingleQuote = false;
  
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    current += char;
    
    if (inDollarQuote) {
      const len = inDollarQuote.length;
      if (sql.substring(i - len + 1, i + 1) === inDollarQuote) {
        inDollarQuote = null;
      }
    } else if (inSingleQuote) {
      if (char === "'") {
        if (sql[i + 1] === "'") {
          current += "'";
          i++;
        } else {
          inSingleQuote = false;
        }
      }
    } else {
      if (char === "'") {
        inSingleQuote = true;
      } else if (char === '$') {
        let j = i + 1;
        while (j < sql.length && sql[j] !== '$' && /[a-zA-Z0-9_]/.test(sql[j])) {
          j++;
        }
        if (j < sql.length && sql[j] === '$') {
          const tag = sql.substring(i, j + 1);
          inDollarQuote = tag;
          current += sql.substring(i + 1, j + 1);
          i = j;
        }
      } else if (char === ';') {
        statements.push(current);
        current = '';
      }
    }
  }
  
  if (current.trim()) {
    statements.push(current);
  }
  return statements.map(s => s.trim()).filter(Boolean);
}

const file = path.join(__dirname, 'migracion', 'vps_backup_raw.sql');
const content = fs.readFileSync(file, 'utf8');
const statements = splitSQL(content);
const functions = [];

statements.forEach(stmt => {
  let clean = stmt.trim();
  while (clean.startsWith('--') || clean.startsWith('/*')) {
    if (clean.startsWith('--')) {
      const idx = clean.indexOf('\n');
      if (idx === -1) { clean = ''; break; }
      clean = clean.substring(idx + 1).trim();
    } else if (clean.startsWith('/*')) {
      const idx = clean.indexOf('*/');
      if (idx === -1) { clean = ''; break; }
      clean = clean.substring(idx + 2).trim();
    }
  }
  if (!clean) return;
  if (/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i.test(clean)) {
    functions.push(clean);
  }
});

console.log("Parsed total functions:", functions.length);
functions.forEach((f, idx) => {
  const firstLine = f.split('\n')[0];
  console.log(`${idx + 1}: ${firstLine}`);
});
