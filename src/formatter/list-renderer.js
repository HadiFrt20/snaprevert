const chalk = require('chalk');
const { timeAgo, formatSize } = require('../utils/timer');

function renderList(snapshots, projectDir, totalSize) {
  if (snapshots.length === 0) {
    return chalk.yellow('  no snapshots yet. run ') + chalk.bold('snaprevert watch') + chalk.yellow(' to start.');
  }

  const lines = [];
  lines.push('');
  lines.push(chalk.gray(`  project: ${projectDir}`));
  lines.push(chalk.gray(`  ${snapshots.length} snapshots (${formatSize(totalSize)} total)`));
  lines.push('');

  // Header
  lines.push(
    chalk.gray('  #   ') +
    chalk.gray('TIME           ') +
    chalk.gray('FILES    ') +
    chalk.gray('SIZE    ') +
    chalk.gray('LABEL')
  );
  lines.push(chalk.gray('  --- -------------- -------- ------- ---------------------------------'));

  for (const snap of snapshots) {
    const num = String(snap.number).padStart(3);
    const time = timeAgo(snap.timestamp).padEnd(14);
    const files = formatFileChanges(snap.changes || []).padEnd(8);
    const size = formatSize(snap.totalSize || 0).padEnd(7);
    let label = snap.label || '';
    if (label.length > 50) label = label.slice(0, 47) + '...';

    let statusIndicator = '';
    if (snap.status === 'rolled-back') {
      statusIndicator = chalk.yellow(' [rolled back]');
    } else if (snap.status === 'restored') {
      statusIndicator = chalk.cyan(' [restored]');
    }

    lines.push(
      `  ${chalk.bold(num)}  ${chalk.gray(time)} ${files} ${chalk.gray(size)} ${label}${statusIndicator}`
    );
  }

  lines.push('');
  return lines.join('\n');
}

function formatFileChanges(changes) {
  const added = changes.filter((c) => c.type === 'added').length;
  const modified = changes.filter((c) => c.type === 'modified').length;
  const deleted = changes.filter((c) => c.type === 'deleted').length;
  const parts = [];
  if (added > 0) parts.push(chalk.green(`+${added}`));
  if (modified > 0) parts.push(chalk.yellow(`~${modified}`));
  if (deleted > 0) parts.push(chalk.red(`-${deleted}`));
  return parts.join(' ') || '-';
}

function renderListJson(snapshots) {
  return JSON.stringify(snapshots, null, 2);
}

module.exports = { renderList, renderListJson, formatFileChanges };
