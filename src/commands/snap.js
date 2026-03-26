const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { init, isInitialized } = require('../storage/store');
const { ChangeBuffer } = require('../watcher/change-buffer');
const { buildIgnoreFilter } = require('../watcher/ignore');
const { listSnapshots } = require('../storage/serializer');

module.exports = function snap(opts) {
  const projectDir = process.cwd();

  if (!isInitialized(projectDir)) {
    init(projectDir);
  }

  const shouldWatch = buildIgnoreFilter(projectDir);
  const buffer = new ChangeBuffer(projectDir, { debounceMs: 0 });

  // Scan all files and create snapshot of current state vs last snapshot
  const snapshots = listSnapshots(projectDir);
  const files = scanFiles(projectDir, shouldWatch);

  // Initialize cache from last snapshot state if available
  // For manual snap, treat all current files as the snapshot
  buffer.initCache(files);

  // Mark all files as modified (simple approach for manual snapshot)
  const changes = files.map((f) => ({
    type: snapshots.length === 0 ? 'added' : 'modified',
    filePath: f,
  }));

  if (changes.length === 0) {
    console.log(chalk.yellow('\n  no files to snapshot.\n'));
    return;
  }

  // Override label if provided
  const meta = buffer.createSnapshot(changes);

  if (meta && opts.label) {
    const metaPath = path.join(projectDir, '.snaprevert', 'snapshots', meta.name, 'meta.json');
    const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    metaData.label = opts.label;
    fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2), 'utf-8');
    meta.label = opts.label;
  }

  if (meta) {
    console.log(chalk.green(`\n  ✓ snapshot #${meta.number} created`) + chalk.gray(` — ${meta.label}\n`));
  } else {
    console.log(chalk.yellow('\n  no changes to snapshot.\n'));
  }
};

function scanFiles(projectDir, shouldWatch) {
  const files = [];
  const scan = (dir) => {
    try {
      for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        if (!shouldWatch(fullPath)) continue;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scan(fullPath);
        } else {
          files.push(path.relative(projectDir, fullPath).replace(/\\/g, '/'));
        }
      }
    } catch {
      // skip
    }
  };
  scan(projectDir);
  return files;
}
