const chalk = require('chalk');
const { listSnapshots } = require('../storage/serializer');
const { isInitialized, getTotalSize } = require('../storage/store');
const { renderList, renderListJson } = require('../formatter/list-renderer');

module.exports = function list(opts) {
  const projectDir = process.cwd();

  if (!isInitialized(projectDir)) {
    console.error(chalk.yellow('\n  no .snaprevert/ found. run ') + chalk.bold('snaprevert watch') + chalk.yellow(' to start.\n'));
    process.exit(1);
  }

  let snapshots = listSnapshots(projectDir);

  // Sort newest first
  snapshots.sort((a, b) => b.timestamp - a.timestamp);

  if (!opts.all) {
    const limit = parseInt(opts.limit, 10) || 20;
    snapshots = snapshots.slice(0, limit);
  }

  if (opts.json) {
    console.log(renderListJson(snapshots));
    return;
  }

  const totalSize = getTotalSize(projectDir);
  console.log(renderList(snapshots, projectDir, totalSize));
};
