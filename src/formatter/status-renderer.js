const chalk = require('chalk');
const { formatSize, timeAgo } = require('../utils/timer');


function renderStatus(info) {
  const lines = [];
  const dim = chalk.dim;
  const bold = chalk.bold;
  const green = chalk.green;
  const yellow = chalk.yellow;
  const cyan = chalk.cyan;
  const white = chalk.white;

  lines.push('');
  lines.push(bold('  snaprevert status'));
  lines.push('');

  // Project info
  const projectPath = info.projectDir.replace(process.env.HOME || '', '~');
  lines.push(`  ${dim('project:')}      ${projectPath}`);
  if (info.watchingSince) {
    lines.push(`  ${dim('watching:')}     since ${timeAgo(info.watchingSince)}`);
  }
  if (info.current) {
    lines.push(`  ${dim('current:')}      #${info.current}`);
  }

  // SNAPSHOTS section
  lines.push('');
  lines.push(bold('  SNAPSHOTS'));
  lines.push(`  ${dim('total:')}        ${white(info.totalSnapshots)}`);
  lines.push(`  ${dim('active:')}       ${green(info.active)}`);
  lines.push(`  ${dim('rolled back:')}  ${yellow(info.rolledBack)}`);
  lines.push(`  ${dim('restored:')}     ${cyan(info.restored)}`);
  lines.push(`  ${dim('storage:')}      ${formatSize(info.storageSize)}`);

  // ACTIVITY (last 24h) section
  lines.push('');
  lines.push(bold('  ACTIVITY') + dim(' (last 24h)'));
  const freqLabel = info.avgPerHour > 0 ? ` (avg ${info.avgPerHour}/hr)` : '';
  lines.push(`  ${dim('snapshots:')}    ${white(info.recentSnapshots)}${dim(freqLabel)}`);
  lines.push(`  ${dim('files touched:')} ${white(info.recentFilesTouched)} unique files`);
  lines.push(`  ${dim('rollbacks:')}    ${yellow(info.recentRollbacks)}`);

  // AI TOOLS section — only if any tool data was detected
  if (info.hasToolData) {
    lines.push('');
    lines.push(bold('  AI TOOLS'));
    const toolEntries = Object.entries(info.toolBreakdown).sort((a, b) => b[1] - a[1]);
    for (const [tool, count] of toolEntries) {
      const toolName = tool.padEnd(14);
      lines.push(`  ${cyan(toolName)} ${white(count)} snapshots`);
    }
    // Show unknown count if some snapshots lack tool info
    const knownCount = toolEntries.reduce((sum, [, c]) => sum + c, 0);
    const unknownCount = info.totalSnapshots - knownCount;
    if (unknownCount > 0) {
      lines.push(`  ${dim('unknown'.padEnd(14))} ${white(unknownCount)} snapshots`);
    }
  }

  // MOST CHANGED FILES — only show if we have enough data
  if (info.mostChanged && info.mostChanged.length >= 3) {
    lines.push('');
    lines.push(bold('  MOST CHANGED FILES'));
    info.mostChanged.forEach((entry, i) => {
      const rank = `${i + 1}.`;
      const filePath = entry.filePath;
      const count = entry.count;
      lines.push(`  ${dim(rank)} ${white(filePath.padEnd(22))} ${dim('\u2014')} ${yellow(count)} changes`);
    });
  }

  lines.push('');
  return lines.join('\n');
}

module.exports = { renderStatus };
