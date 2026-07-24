const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\Edwin\\.gemini\\antigravity-cli\\brain\\ce98ed8a-ad67-4250-b819-7a00fadc33be\\.system_generated\\tasks\\task-477.log', 'utf8');

const regex = /.*cloudix_auth_user_id.*/gi;
const matches = content.match(regex);
if (matches) {
  console.log(`Found ${matches.length} matches in log:`);
  matches.slice(0, 15).forEach((m, idx) => {
    console.log(`${idx + 1}: ${m}`);
  });
} else {
  console.log("No matches found in log.");
}
