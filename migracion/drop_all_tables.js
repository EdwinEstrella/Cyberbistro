const { execSync } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, '..', 'node_modules', '@insforge', 'cli', 'dist', 'index.js');

try {
  console.log("Fetching tables in public schema...");
  const tableResultRaw = execSync(`node "${cliPath}" db query "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'" --json`, { encoding: 'utf8' });
  const tables = JSON.parse(tableResultRaw).rows.map(r => r.table_name);
  
  if (tables.length > 0) {
    console.log(`Found ${tables.length} tables to drop: ${tables.join(', ')}`);
    const dropTablesSql = `DROP TABLE IF EXISTS ${tables.map(t => `public."${t}"`).join(', ')} CASCADE;`;
    execSync(`node "${cliPath}" db query "${dropTablesSql}"`, { encoding: 'utf8' });
    console.log("✓ All tables dropped successfully.");
  } else {
    console.log("No tables found in public schema.");
  }

  console.log("Fetching functions in public schema...");
  const funcResultRaw = execSync(`node "${cliPath}" db query "SELECT routine_name, routine_type FROM information_schema.routines WHERE routine_schema = 'public'" --json`, { encoding: 'utf8' });
  const functions = JSON.parse(funcResultRaw).rows;
  
  if (functions.length > 0) {
    console.log(`Found ${functions.length} routines to drop...`);
    // Drop functions individually to handle signature requirements
    functions.forEach(f => {
      try {
        execSync(`node "${cliPath}" db query "DROP ROUTINE IF EXISTS public.\\"${f.routine_name}\\" CASCADE;"`, { encoding: 'utf8' });
      } catch (err) {
        console.log(`  Could not drop routine ${f.routine_name}: ${err.message}`);
      }
    });
    console.log("✓ Routines dropped.");
  } else {
    console.log("No routines found in public schema.");
  }

  console.log("Fetching sequences in public schema...");
  const seqResultRaw = execSync(`node "${cliPath}" db query "SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'" --json`, { encoding: 'utf8' });
  const sequences = JSON.parse(seqResultRaw).rows.map(r => r.sequence_name);
  
  if (sequences.length > 0) {
    console.log(`Found ${sequences.length} sequences to drop...`);
    const dropSeqsSql = `DROP SEQUENCE IF EXISTS ${sequences.map(s => `public."${s}"`).join(', ')} CASCADE;`;
    execSync(`node "${cliPath}" db query "${dropSeqsSql}"`, { encoding: 'utf8' });
    console.log("✓ Sequences dropped.");
  } else {
    console.log("No sequences found.");
  }

  console.log("✓ Public schema cleanup complete!");
} catch (err) {
  console.error("Cleanup failed:", err.message);
  if (err.stdout) console.log("Stdout:", err.stdout);
  if (err.stderr) console.log("Stderr:", err.stderr);
}
