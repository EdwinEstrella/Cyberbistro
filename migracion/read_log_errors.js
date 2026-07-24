const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\Edwin\\.gemini\\antigravity-cli\\brain\\ce98ed8a-ad67-4250-b819-7a00fadc33be\\.system_generated\\tasks\\task-285.log', 'utf8');

const regex = /✗ Statement failed in group CONSTRAINTS:[\s\S]+?Error message: [\s\S]+?\n\n/g;
const matches = content.match(regex);
if (matches) {
  console.log(`Found ${matches.length} failed constraints.`);
  matches.slice(0, 5).forEach((m, idx) => {
    console.log(`--- Failed Constraint ${idx + 1} ---`);
    console.log(m);
  });
} else {
  console.log("No failed constraints logged.");
}
