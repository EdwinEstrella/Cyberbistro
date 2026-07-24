const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(srcDir, 'migracion');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir);
}

const files = [
  'migrate_users.js',
  'download_storage.js',
  'extract_sql.js',
  'import_sql_ordered.js',
  'find_array_types.js',
  'read_log_errors.js',
  'search_pkeys.js',
  'check_vps_pkeys.js',
  'search_primary.js',
  'examine_backup_keys.js',
  'examine_config.js',
  'search_constraints.js',
  'test_vps_online.js',
  'check_vps_constraints.js',
  'extract_vps_constraints.js',
  'reset_cloud_public_schema.js',
  'drop_all_tables.js',
  'vps_constraints.sql',
  'vps_backup.sql',
  'vps_backup_raw.sql',
  'find_array_types.js',
  'read_log_errors.js'
];

files.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  if (fs.existsSync(srcPath)) {
    try {
      // Copy first to avoid locking issues while task-477 is running
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied ${file} to migracion/`);
      // If it's not a sql file or import_sql_ordered.js, we can safely delete it now from root
      if (!file.endsWith('.sql') && file !== 'import_sql_ordered.js') {
        fs.unlinkSync(srcPath);
        console.log(`Deleted original ${file} from root`);
      }
    } catch (err) {
      console.log(`Error copying/deleting ${file}:`, err.message);
    }
  }
});

console.log("Migration folder organization completed!");
