const chalk = require('chalk');
const readline = require('readline');
const { listSnapshots } = require('../storage/serializer');
const { isInitialized } = require('../storage/store');
const { rollback } = require('../engine/rollback');
const { timeAgo } = require('../utils/timer');
const { formatFileChanges } = require('../formatter/list-renderer');

module.exports = async function back(number, opts) {
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

  const toUndo = snapshots
    .filter((s) => s.number > num && s.status === 'active')
    .sort((a, b) => b.number - a.number);

  if (toUndo.length === 0) {
    console.log(chalk.yellow(`\n  no active snapshots after #${num} to undo.\n`));
    return;
  }

  // Show what will be undone
  console.log(chalk.yellow(`\n  ! this will undo ${toUndo.length} snapshot(s)\n`));

  for (const snap of toUndo) {
    const files = formatFileChanges(snap.changes || []);
    console.log(chalk.gray(`  #${snap.number}  "${snap.label}"  ${files}`));
  }

  console.log(`\n  your code will return to the state after snapshot #${num}:`);
  console.log(chalk.cyan(`  "${target.label}" (${timeAgo(target.timestamp)})\n`));

  if (opts.dry) {
    console.log(chalk.gray('  --dry mode: no changes made.\n'));
    return;
  }

  if (!opts.yes) {
    const confirmed = await confirm('  confirm? [y/N] ');
    if (!confirmed) {
      console.log(chalk.gray('\n  cancelled.\n'));
      return;
    }
  }

  try {
    rollback(projectDir, num);

    for (const snap of toUndo) {
      console.log(chalk.gray(`  reverting snapshot #${snap.number}... done`));
    }

    console.log(chalk.green(`\n  OK rolled back to snapshot #${num}\n`));
    console.log(chalk.gray('  rolled-back snapshots are preserved. run ') +
      chalk.bold('snaprevert restore <#>') +
      chalk.gray(' to re-apply any of them.\n'));
  } catch (err) {
    console.error(chalk.red(`\n  rollback failed: ${err.message}\n`));
    process.exit(1);
  }
};

function confirm(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
