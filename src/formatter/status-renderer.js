const chalk = require('chalk');
const { formatSize } = require('../utils/timer');

function renderStatus(info) {
  const lines = [];
  lines.push('');
  lines.push(chalk.bold('  snaprevert status'));
  lines.push('');
  lines.push(`  project:      ${info.projectDir}`);
  lines.push(`  snapshots:    ${info.totalSnapshots}`);
  lines.push(`  active:       ${chalk.green(info.active)}`);
  lines.push(`  rolled back:  ${chalk.yellow(info.rolledBack)}`);
  lines.push(`  restored:     ${chalk.cyan(info.restored)}`);
  lines.push(`  storage:      ${formatSize(info.storageSize)}`);
  if (info.current) {
    lines.push(`  current:      #${info.current}`);
  }
  lines.push('');
  return lines.join('\n');
}

module.exports = { renderStatus };
