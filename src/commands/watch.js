const chalk = require('chalk');
const path = require('path');
const { Watcher } = require('../watcher/watcher');
const { init, isInitialized } = require('../storage/store');

module.exports = function watch(opts) {
  const projectDir = process.cwd();

  init(projectDir);

  console.log(chalk.bold('\n  snaprevert') + chalk.gray(' v0.1.0'));
  console.log(chalk.gray(`  watching ${projectDir}\n`));
  console.log(chalk.gray('  changes will be auto-snapshotted. press ctrl+c to stop.\n'));

  const watcher = new Watcher(projectDir, {
    onSnapshot: (meta) => {
      const time = new Date(meta.timestamp).toLocaleTimeString();
      console.log(
        chalk.green(`  ✓ snapshot #${meta.number}`) +
        chalk.gray(` at ${time} — `) +
        chalk.white(meta.label)
      );
    },
  });

  watcher.start();

  // Clean shutdown
  const cleanup = async () => {
    console.log(chalk.gray('\n  stopping watcher...'));
    await watcher.stop();
    console.log(chalk.gray('  done.\n'));
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
};
