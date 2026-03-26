const chalk = require('chalk');
const { listSnapshots, loadSnapshot } = require('../storage/serializer');
const { isInitialized } = require('../storage/store');
const { renderDiff, renderDiffJson } = require('../formatter/diff-renderer');

module.exports = function diff(number, opts) {
  const projectDir = process.cwd();

  if (!isInitialized(projectDir)) {
    console.error(chalk.red('\n  no .snaprevert/ found. run snaprevert watch to start.\n'));
    process.exit(1);
  }

  const num = parseInt(number, 10);
  if (isNaN(num)) {
    console.error(chalk.red('\n  invalid snapshot number.\n'));
    process.exit(1);
  }

  const snapshots = listSnapshots(projectDir);
  const target = snapshots.find((s) => s.number === num);

  if (!target) {
    console.error(chalk.red(`\n  snapshot #${num} not found.\n`));
    process.exit(1);
  }

  const snapshot = loadSnapshot(projectDir, target.name);
  if (!snapshot) {
    console.error(chalk.red(`\n  could not load snapshot #${num}.\n`));
    process.exit(1);
  }

  if (opts.json) {
    console.log(renderDiffJson(snapshot));
    return;
  }

  console.log(renderDiff(snapshot, {
    filesOnly: opts.filesOnly,
    full: opts.full,
  }));
};
