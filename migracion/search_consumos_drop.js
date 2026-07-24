const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\Edwin\\.gemini\\antigravity-cli\\brain\\ce98ed8a-ad67-4250-b819-7a00fadc33be\\.system_generated\\tasks\\task-569.log', 'utf8');

const regex = /.*consumos.*/gi;
const matches = content.match(regex);
if (matches) {
  console.log(`Found ${matches.length} matches in drop log:`);
  matches.forEach(m => console.log(m));
} else {
  console.log("No matches found in drop log.");
}
