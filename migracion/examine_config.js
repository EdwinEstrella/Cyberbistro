const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '.insforge', 'restaurante.json');
if (!fs.existsSync(file)) {
  console.log("restaurante.json does not exist!");
  process.exit(0);
}

const content = fs.readFileSync(file, 'utf8');
const data = JSON.parse(content);
console.log("Keys in config:", Object.keys(data));
if (data.database) {
  console.log("Database keys:", Object.keys(data.database));
  if (data.database.tables) {
    console.log("Total tables in metadata:", data.database.tables.length);
    console.log("Sample table metadata:", JSON.stringify(data.database.tables[0], null, 2));
  }
}
