const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\Edwin\\Desktop\\Trabajos\\cyberbistro\\vps_backup.sql', 'utf8');
const parsed = JSON.parse(content);
const sql = parsed.data;

const tables = [];
const regex = /-- Table: (\w+)/g;
let match;
while ((match = regex.exec(sql)) !== null) {
  tables.push(match[1]);
}

console.log("Total tables found in SQL:", tables.length);
console.log("Tables:", tables.join(", "));

const authMatch = sql.includes('auth.users') || sql.includes('CREATE SCHEMA auth') || sql.includes('INSERT INTO auth.users') || sql.includes('users');
console.log("Contains auth references:", authMatch);
if (sql.includes('auth.users')) {
  console.log("Found direct 'auth.users' string");
}
