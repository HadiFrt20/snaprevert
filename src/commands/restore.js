const chalk = require('chalk');
const { isInitialized } = require('../storage/store');
const { restore } = require('../engine/restore');

module.exports = function restoreCmd(number, opts) {
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

  try {
    const result = restore(projectDir, num);
    console.log(chalk.green(`\n  ✓ restored snapshot #${num}\n`));
    console.log(chalk.gray(`  ${result.changes.length} file change(s) re-applied.\n`));
  } catch (err) {
    console.error(chalk.red(`\n  restore failed: ${err.message}\n`));
    process.exit(1);
  }
};
