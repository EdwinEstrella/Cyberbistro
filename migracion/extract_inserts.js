const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('restaurante-backup.sql', 'utf8'));
const statements = raw.data.split(/;\n/);

let inserts = [];
for (let s of statements) {
    if (s.trim().startsWith('INSERT')) {
        inserts.push(s.trim());
    }
}

fs.writeFileSync('insert_data_only.sql', inserts.join(';\n') + ';');
console.log(`Found ${inserts.length} INSERT statements.`);
