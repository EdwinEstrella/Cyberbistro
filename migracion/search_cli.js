const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, 'node_modules', '@insforge', 'cli', 'dist', 'index.js');
if (fs.existsSync(indexFile)) {
  const content = fs.readFileSync(indexFile, 'utf8');
  console.log("Index.js file found. Size in bytes:", content.length);
  
  // Find URL/HTTP calls
  const matches = [];
  const regex = /\/api\/database\/query|\/rawsql|query/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    matches.push({ index: match.index, text: content.substring(match.index - 50, match.index + 100) });
  }
  
  console.log(`Found ${matches.length} occurrences matching query/rawsql.`);
  matches.slice(0, 10).forEach((m, idx) => {
    console.log(`[${idx + 1}] ... ${m.text.replace(/\n/g, ' ')} ...`);
  });
} else {
  console.log("Index.js file not found!");
}
