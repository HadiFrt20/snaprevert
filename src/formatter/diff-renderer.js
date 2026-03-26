const chalk = require('chalk');
const { timeAgo, formatSize } = require('../utils/timer');

function renderDiff(snapshot, options = {}) {
  const { meta, diffs, addedFiles } = snapshot;
  const lines = [];

  lines.push('');
  lines.push(
    chalk.bold(`  snapshot #${meta.number}: `) + chalk.cyan(`"${meta.label || 'unlabeled'}"`)
  );

  const added = (meta.changes || []).filter((c) => c.type === 'added');
  const modified = (meta.changes || []).filter((c) => c.type === 'modified');
  const deleted = (meta.changes || []).filter((c) => c.type === 'deleted');

  const fileParts = [];
  if (added.length > 0) fileParts.push(`+${added.length} files`);
  if (modified.length > 0) fileParts.push(`~${modified.length} files`);
  if (deleted.length > 0) fileParts.push(`-${deleted.length} files`);

  lines.push(
    chalk.gray(`  ${timeAgo(meta.timestamp)} | ${fileParts.join('  ')} | ${formatSize(meta.totalSize || 0)} changed`)
  );
  lines.push('');

  // File summary
  for (const change of meta.changes || []) {
    if (change.type === 'added') {
      const content = addedFiles[change.filePath] || '';
      const lineCount = content.split('\n').length;
      lines.push(chalk.green(`  + ${change.filePath}`) + chalk.gray(` (new — ${lineCount} lines)`));
    } else if (change.type === 'modified') {
      lines.push(chalk.yellow(`  ~ ${change.filePath}`));
    } else if (change.type === 'deleted') {
      lines.push(chalk.red(`  - ${change.filePath}`) + chalk.gray(' (deleted)'));
    }
  }

  if (options.filesOnly) {
    lines.push('');
    return lines.join('\n');
  }

  // Inline diffs for modified files
  for (const change of modified) {
    const diff = diffs[change.filePath];
    if (!diff) continue;

    lines.push('');
    lines.push(chalk.gray(`  ──── ${change.filePath} ────────────────────────────`));
    lines.push('');

    const diffLines = diff.split('\n');
    for (const line of diffLines) {
      if (line.startsWith('@@')) {
        lines.push(chalk.cyan(`    ${line}`));
      } else if (line.startsWith('+')) {
        lines.push(chalk.green(`    ${line}`));
      } else if (line.startsWith('-')) {
        lines.push(chalk.red(`    ${line}`));
      } else if (line.startsWith(' ')) {
        lines.push(chalk.gray(`    ${line}`));
      }
    }
  }

  // Show full content of added files if --full flag
  if (options.full) {
    for (const change of added) {
      const content = addedFiles[change.filePath];
      if (!content) continue;

      lines.push('');
      lines.push(chalk.gray(`  ──── ${change.filePath} (new) ────────────────────`));
      lines.push('');
      for (const line of content.split('\n')) {
        lines.push(chalk.green(`    +${line}`));
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

function renderDiffJson(snapshot) {
  return JSON.stringify(snapshot, null, 2);
}

module.exports = { renderDiff, renderDiffJson };
