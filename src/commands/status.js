const chalk = require('chalk');
const { listSnapshots } = require('../storage/serializer');
const { isInitialized, getTotalSize } = require('../storage/store');
const { getCurrentState } = require('../engine/state');
const { renderStatus } = require('../formatter/status-renderer');

module.exports = function status(_opts) {
  const projectDir = process.cwd();

  if (!isInitialized(projectDir)) {
    console.error(chalk.red('\n  no .snaprevert/ found. run snaprevert watch to start.\n'));
    process.exit(1);
  }

  const snapshots = listSnapshots(projectDir);
  const state = getCurrentState(projectDir);

  const info = {
    projectDir,
    totalSnapshots: snapshots.length,
    active: snapshots.filter((s) => s.status === 'active').length,
    rolledBack: snapshots.filter((s) => s.status === 'rolled-back').length,
    restored: snapshots.filter((s) => s.status === 'restored').length,
    storageSize: getTotalSize(projectDir),
    current: state.current,
  };

  console.log(renderStatus(info));
};
