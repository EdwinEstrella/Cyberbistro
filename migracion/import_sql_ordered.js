const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const sqlFile = path.join(__dirname, 'vps_backup_raw.sql');
if (!fs.existsSync(sqlFile)) {
  console.error("vps_backup_raw.sql not found!");
  process.exit(1);
}

console.log("Loading SQL file...");
let content = fs.readFileSync(sqlFile, 'utf8');

// Fix array syntax errors in the SQL content
console.log("Fixing known SQL syntax errors (ARRAY types)...");
content = content.replace(/comanda_ids\s+ARRAY/gi, 'comanda_ids uuid[]');
content = content.replace(/fusion_hijos\s+ARRAY/gi, 'fusion_hijos integer[]');

function splitSQL(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = null;
  let inSingleQuote = false;
  
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    current += char;
    
    if (inDollarQuote) {
      const len = inDollarQuote.length;
      if (sql.substring(i - len + 1, i + 1) === inDollarQuote) {
        inDollarQuote = null;
      }
    } else if (inSingleQuote) {
      if (char === "'") {
        if (sql[i + 1] === "'") {
          current += "'";
          i++;
        } else {
          inSingleQuote = false;
        }
      }
    } else {
      if (char === "'") {
        inSingleQuote = true;
      } else if (char === '$') {
        let j = i + 1;
        while (j < sql.length && sql[j] !== '$' && /[a-zA-Z0-9_]/.test(sql[j])) {
          j++;
        }
        if (j < sql.length && sql[j] === '$') {
          const tag = sql.substring(i, j + 1);
          inDollarQuote = tag;
          current += sql.substring(i + 1, j + 1);
          i = j;
        }
      } else if (char === ';') {
        statements.push(current);
        current = '';
      }
    }
  }
  
  if (current.trim()) {
    statements.push(current);
  }
  return statements.map(s => s.trim()).filter(Boolean);
}

console.log("Parsing SQL statements...");
const statements = splitSQL(content);
console.log(`Total SQL statements parsed: ${statements.length}`);

// Group statements
const groups = {
  SEQUENCES: [],
  TABLES: [],
  FUNCTIONS: [],
  RLS_ENABLE: [],
  VIEWS: [],
  TRIGGERS: [],
  CONSTRAINTS: [],
  POLICIES: [],
  INDEXES: [],
  INSERTS: [],
  OTHERS: []
};

statements.forEach(stmt => {
  let clean = stmt.trim();
  while (clean.startsWith('--') || clean.startsWith('/*')) {
    if (clean.startsWith('--')) {
      const idx = clean.indexOf('\n');
      if (idx === -1) {
        clean = '';
        break;
      }
      clean = clean.substring(idx + 1).trim();
    } else if (clean.startsWith('/*')) {
      const idx = clean.indexOf('*/');
      if (idx === -1) {
        clean = '';
        break;
      }
      clean = clean.substring(idx + 2).trim();
    }
  }
  
  if (!clean) return;
  
  if (/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i.test(clean)) {
    groups.FUNCTIONS.push(clean);
  } else if (/^\s*CREATE\s+SEQUENCE/i.test(clean)) {
    groups.SEQUENCES.push(clean);
  } else if (/^\s*CREATE\s+TABLE/i.test(clean)) {
    groups.TABLES.push(clean);
  } else if (/^\s*ALTER\s+TABLE\s+.+\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(clean)) {
    groups.RLS_ENABLE.push(clean);
  } else if (/^\s*CREATE\s+POLICY/i.test(clean)) {
    groups.POLICIES.push(clean);
  } else if (/^\s*CREATE\s+(?:UNIQUE\s+)?INDEX/i.test(clean)) {
    groups.INDEXES.push(clean);
  } else if (/^\s*ALTER\s+TABLE\s+.+\s+ADD\s+CONSTRAINT/i.test(clean)) {
    groups.CONSTRAINTS.push(clean);
  } else if (/^\s*INSERT\s+INTO/i.test(clean)) {
    groups.INSERTS.push(clean);
  } else if (/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?VIEW/i.test(clean)) {
    groups.VIEWS.push(clean);
  } else if (/^\s*CREATE\s+TRIGGER/i.test(clean)) {
    groups.TRIGGERS.push(clean);
  } else {
    groups.OTHERS.push(clean);
  }
});

// Load constraints from vps_constraints.sql to ensure primary keys are created
const constraintsFile = path.join(__dirname, 'vps_constraints.sql');
if (fs.existsSync(constraintsFile)) {
  console.log("Loading constraints from vps_constraints.sql...");
  const constraintsContent = fs.readFileSync(constraintsFile, 'utf8');
  const rawConstraints = splitSQL(constraintsContent);
  groups.CONSTRAINTS = rawConstraints.map(c => c.trim()).filter(Boolean);
  console.log(`Loaded and replaced with ${groups.CONSTRAINTS.length} constraints from vps_constraints.sql (including primary keys!)`);
} else {
  console.log("Warning: vps_constraints.sql not found!");
}

for (let name in groups) {
  console.log(`Group ${name}: ${groups[name].length} statement(s)`);
}

const executionOrder = [
  'SEQUENCES',
  'TABLES',
  'FUNCTIONS',
  'RLS_ENABLE',
  'VIEWS',
  'TRIGGERS',
  'CONSTRAINTS',
  'POLICIES',
  'INDEXES',
  'INSERTS',
  'OTHERS'
];

const cliPath = path.join(__dirname, 'node_modules', '@insforge', 'cli', 'dist', 'index.js');
let successCount = 0;
let failCount = 0;

function executeGroupWithBatching(groupName, stmts) {
  if (stmts.length === 0) return;
  console.log(`\n=== Running Group: ${groupName} (${stmts.length} statements) ===`);
  
  const batchSize = 100;
  const batches = [];
  for (let i = 0; i < stmts.length; i += batchSize) {
    batches.push(stmts.slice(i, i + batchSize));
  }
  
  const failedStatements = [];
  
  batches.forEach((batch, batchIdx) => {
    console.log(`  Processing batch ${batchIdx + 1}/${batches.length} (${batch.length} statements)...`);
    const batchSql = batch.join('\n');
    try {
      execFileSync('node', [cliPath, 'db', 'query', batchSql], { encoding: 'utf8' });
      successCount += batch.length;
    } catch (err) {
      console.log(`  ⚠️ Batch ${batchIdx + 1} failed. Falling back to executing statements individually...`);
      batch.forEach(stmt => {
        try {
          execFileSync('node', [cliPath, 'db', 'query', stmt], { encoding: 'utf8' });
          successCount++;
        } catch (singleErr) {
          failedStatements.push({ stmt, err: singleErr });
        }
      });
    }
  });
  
  if (failedStatements.length === 0) {
    console.log(`  ✓ All statements in ${groupName} executed successfully!`);
    return;
  }
  
  let retries = 5;
  let toRun = failedStatements.map(f => f.stmt);
  
  while (toRun.length > 0 && retries > 0) {
    const failedNext = [];
    console.log(`  Retrying ${toRun.length} failed statement(s) individually (Attempts remaining: ${retries})...`);
    
    toRun.forEach((stmt, idx) => {
      try {
        execFileSync('node', [cliPath, 'db', 'query', stmt], { encoding: 'utf8' });
        successCount++;
      } catch (err) {
        failedNext.push({ stmt, err });
      }
    });
    
    if (failedNext.length === toRun.length) {
      console.log(`  No statements succeeded in this retry loop. Logging remaining errors...`);
      failedNext.forEach(f => {
        failCount++;
        console.error(`  ✗ Statement failed in group ${groupName}: ${f.stmt.trim().substring(0, 150)}...`);
        console.error(`  Error message: ${f.err.message}`);
        if (f.err.stdout) console.error(`  Stdout: ${f.err.stdout}`);
        if (f.err.stderr) console.error(`  Stderr: ${f.err.stderr}`);
      });
      break;
    }
    
    if (failedNext.length === 0) {
      console.log(`  ✓ All remaining statements in ${groupName} executed successfully!`);
      break;
    }
    
    console.log(`  --> ${failedNext.length} statements failed. Retrying them in next pass...`);
    toRun = failedNext.map(f => f.stmt);
    retries--;
  }
}

// Run all groups in order
executionOrder.forEach(groupName => {
  executeGroupWithBatching(groupName, groups[groupName]);
});

console.log(`\nAll done! Success: ${successCount}, Failed: ${failCount}`);
