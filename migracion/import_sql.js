const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const sqlFile = path.join(__dirname, 'vps_backup_raw.sql');
if (!fs.existsSync(sqlFile)) {
  console.error("vps_backup_raw.sql not found!");
  process.exit(1);
}

const content = fs.readFileSync(sqlFile, 'utf8');

// Parse statements: split by semicolon at the end of a line
const rawLines = content.split('\n');
const statements = [];
let currentStmt = [];

for (let line of rawLines) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  if (trimmed.startsWith('--')) continue; // Skip comments
  
  currentStmt.push(line);
  if (trimmed.endsWith(';')) {
    statements.push(currentStmt.join('\n'));
    currentStmt = [];
  }
}
if (currentStmt.length > 0) {
  statements.push(currentStmt.join('\n'));
}

console.log(`Total SQL statements parsed: ${statements.length}`);

// We will execute the statements
let successCount = 0;
let failCount = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i].trim();
  if (!stmt) continue;

  console.log(`[${i + 1}/${statements.length}] Executing statement (length: ${stmt.length})...`);
  
  // Escape double quotes for Windows command line execution
  const escapedStmt = stmt.replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/\r/g, '');
  
  try {
    // Run the query via CLI
    execSync(`npx @insforge/cli db query "${escapedStmt}"`, { stdio: 'ignore' });
    successCount++;
  } catch (err) {
    failCount++;
    console.error(`✗ Statement failed: ${stmt.substring(0, 150)}...`);
    console.error(`Error details:`, err.message);
  }
}

console.log(`Execution complete. Success: ${successCount}, Failed: ${failCount}`);
