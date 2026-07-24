const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('restaurante-backup-full.json', 'utf8'));
const statements = raw.data.split(/;\n/);

let inserts = [];
for (let s of statements) {
    if (s.trim().startsWith('INSERT INTO')) {
        // Some tables might have unique constraints that aren't the primary key.
        // The safest approach is DO NOTHING. However, ON CONFLICT DO NOTHING requires a constraint target?
        // Actually, in Postgres `ON CONFLICT DO NOTHING` without a target works for ANY constraint violation!
        
        let stmt = s.trim();
        if (!stmt.includes('ON CONFLICT')) {
            stmt = stmt + ' ON CONFLICT DO NOTHING';
        }
        inserts.push(stmt);
    }
}

fs.writeFileSync('datos_faltantes.sql', inserts.join(';\n') + ';');
console.log(`Prepared ${inserts.length} INSERT statements.`);
