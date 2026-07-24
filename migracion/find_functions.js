const fs = require('fs');
const content = fs.readFileSync('vps_backup_raw.sql', 'utf8');

const regex = /CREATE (?:OR REPLACE )?FUNCTION [\s\S]+?LANGUAGE \w+;?/g;
const matches = content.match(regex);
if (matches) {
  console.log(`Found ${matches.length} functions.`);
  matches.forEach((m, idx) => {
    console.log(`--- Function ${idx + 1} ---`);
    console.log(m.substring(0, 200) + '...');
  });
} else {
  console.log("No functions found using regex.");
}
