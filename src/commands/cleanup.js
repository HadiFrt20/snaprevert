const chalk = require('chalk');
const { listSnapshots } = require('../storage/serializer');
const { isInitialized, deleteSnapshotDir } = require('../storage/store');
const { loadConfig } = require('../utils/config');
const { parseDuration, formatSize, timeAgo } = require('../utils/timer');

module.exports = function cleanup(opts) {
  const projectDir = process.cwd();

  if (!isInitialized(projectDir)) {
    console.error(chalk.red('\n  no .snaprevert/ found. run snaprevert watch to start.\n'));
    process.exit(1);
  }

  const config = loadConfig(projectDir);
  const snapshots = listSnapshots(projectDir);
  snapshots.sort((a, b) => a.timestamp - b.timestamp); // oldest first

  const MIN_KEEP = 5;
  let toPrune = [];

  if (opts.keep) {
    const keep = parseInt(opts.keep, 10);
    if (isNaN(keep) || keep < 1) {
      console.error(chalk.red('\n  --keep must be a positive number.\n'));
      process.exit(1);
    }
    if (snapshots.length > keep) {
      toPrune = snapshots.slice(0, snapshots.length - keep);
    }
  } else if (opts.older) {
    const duration = parseDuration(opts.older);
    if (!duration) {
      console.error(chalk.red('\n  invalid duration format. use e.g. 7d, 24h, 30m.\n'));
      process.exit(1);
    }
    const cutoff = Date.now() - duration;
    toPrune = snapshots.filter((s) => s.timestamp < cutoff);
  } else {
    // Default: use retention_days
    const cutoff = Date.now() - config.retention_days * 86400000;
    toPrune = snapshots.filter((s) => s.timestamp < cutoff);
  }

  // Never prune the most recent MIN_KEEP
  const recentNames = new Set(
    snapshots.slice(-MIN_KEEP).map((s) => s.name)
  );
  toPrune = toPrune.filter((s) => !recentNames.has(s.name));

  if (toPrune.length === 0) {
    console.log(chalk.gray('\n  nothing to prune.\n'));
    return;
  }

  console.log(chalk.bold(`\n  ${toPrune.length} snapshot(s) to prune:\n`));

  let totalSize = 0;
  for (const snap of toPrune) {
    totalSize += snap.totalSize || 0;
    console.log(chalk.gray(`  #${snap.number}  ${timeAgo(snap.timestamp)}  "${snap.label}"`));
  }

  console.log(chalk.gray(`\n  total: ${formatSize(totalSize)}\n`));

  if (opts.dry) {
    console.log(chalk.gray('  --dry mode: no changes made.\n'));
    return;
  }

  for (const snap of toPrune) {
    deleteSnapshotDir(projectDir, snap.name);
  }

  console.log(chalk.green(`  ✓ pruned ${toPrune.length} snapshots.\n`));
};
