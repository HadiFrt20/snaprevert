const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { listSnapshots, loadSnapshot, saveSnapshot } = require('../storage/serializer');
const { isInitialized, init } = require('../storage/store');
const { applyDiff, reverseDiff } = require('../storage/differ');
const { shortId } = require('../utils/hash');
const { setCurrentState } = require('../engine/state');

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim().toLowerCase());
    });
  });
}

function renderChangeHeader(index, total, change, addedFiles) {
  const lines = [];
  lines.push('');

  if (change.type === 'added') {
    const content = addedFiles[change.filePath] || '';
    const lineCount = content.split('\n').length;
    lines.push(
      chalk.bold(`  ${index}/${total}  `) +
      chalk.green(`+ ${change.filePath}`) +
      chalk.gray(` (new — ${lineCount} lines)`)
    );
  } else if (change.type === 'modified') {
    lines.push(
      chalk.bold(`  ${index}/${total}  `) +
      chalk.yellow(`~ ${change.filePath}`) +
      chalk.gray(' (modified)')
    );
  } else if (change.type === 'deleted') {
    lines.push(
      chalk.bold(`  ${index}/${total}  `) +
      chalk.red(`- ${change.filePath}`) +
      chalk.gray(' (deleted)')
    );
  }

  return lines.join('\n');
}

function renderDiffPreview(change, diffs, addedFiles, maxLines = 10) {
  const lines = [];
  lines.push('');

  if (change.type === 'added') {
    const content = addedFiles[change.filePath] || '';
    const contentLines = content.split('\n');
    const showLines = contentLines.slice(0, maxLines);
    for (const line of showLines) {
      lines.push(chalk.green(`    +${line}`));
    }
    if (contentLines.length > maxLines) {
      lines.push(chalk.gray(`    ... ${contentLines.length - maxLines} more lines`));
    }
  } else if (change.type === 'modified') {
    const diff = diffs[change.filePath];
    if (diff) {
      const diffLines = diff.split('\n');
      let shown = 0;
      for (const line of diffLines) {
        if (shown >= maxLines) {
          lines.push(chalk.gray(`    ... more changes`));
          break;
        }
        if (line.startsWith('@@')) {
          lines.push(chalk.cyan(`    ${line}`));
          shown++;
        } else if (line.startsWith('+')) {
          lines.push(chalk.green(`    ${line}`));
          shown++;
        } else if (line.startsWith('-')) {
          lines.push(chalk.red(`    ${line}`));
          shown++;
        } else if (line.startsWith(' ')) {
          lines.push(chalk.gray(`    ${line}`));
          shown++;
        }
      }
    } else {
      lines.push(chalk.gray('    (no diff available)'));
    }
  } else if (change.type === 'deleted') {
    lines.push(chalk.red('    file was deleted'));
  }

  return lines.join('\n');
}

function renderFullDiff(change, diffs, addedFiles) {
  const lines = [];
  lines.push('');
  lines.push(chalk.gray(`  ──── ${change.filePath} ────────────────────────────`));
  lines.push('');

  if (change.type === 'added') {
    const content = addedFiles[change.filePath] || '';
    for (const line of content.split('\n')) {
      lines.push(chalk.green(`    +${line}`));
    }
  } else if (change.type === 'modified') {
    const diff = diffs[change.filePath];
    if (diff) {
      for (const line of diff.split('\n')) {
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
    } else {
      lines.push(chalk.gray('    (no diff available)'));
    }
  } else if (change.type === 'deleted') {
    const deletedContent = addedFiles['__deleted__/' + change.filePath];
    if (deletedContent) {
      for (const line of deletedContent.split('\n')) {
        lines.push(chalk.red(`    -${line}`));
      }
    } else {
      lines.push(chalk.red('    file was deleted (content not available)'));
    }
  }

  lines.push('');
  return lines.join('\n');
}

function revertFile(projectDir, change, diffs, addedFiles) {
  const absPath = path.join(projectDir, change.filePath);

  if (change.type === 'added') {
    // Revert an add = delete the file
    try {
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
        // Clean up empty parent dirs
        let dir = path.dirname(absPath);
        while (dir !== projectDir && dir.startsWith(projectDir)) {
          try {
            const entries = fs.readdirSync(dir);
            if (entries.length === 0) {
              fs.rmdirSync(dir);
              dir = path.dirname(dir);
            } else {
              break;
            }
          } catch { break; }
        }
        return true;
      }
    } catch {
      return false;
    }
  } else if (change.type === 'modified') {
    // Revert a modification = apply reverse diff
    const diff = diffs[change.filePath];
    if (diff) {
      try {
        const currentContent = fs.readFileSync(absPath, 'utf-8');
        const reversed = reverseDiff(diff);
        const restored = applyDiff(currentContent, reversed);
        fs.writeFileSync(absPath, restored, 'utf-8');
        return true;
      } catch {
        return false;
      }
    }
  } else if (change.type === 'deleted') {
    // Revert a delete = restore the file
    const deletedContent = addedFiles['__deleted__/' + change.filePath];
    if (deletedContent !== undefined) {
      try {
        const dir = path.dirname(absPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(absPath, deletedContent, 'utf-8');
        return true;
      } catch {
        return false;
      }
    }
  }

  return false;
}

module.exports = async function review(number, _opts) {
  const projectDir = process.cwd();

  if (!isInitialized(projectDir)) {
    console.error(chalk.red('\n  no .snaprevert/ found. run snaprevert watch to start.\n'));
    process.exit(1);
  }

  init(projectDir);

  const num = parseInt(number, 10);
  if (isNaN(num)) {
    console.error(chalk.red('\n  invalid snapshot number.\n'));
    process.exit(1);
  }

  const allSnapshots = listSnapshots(projectDir);
  const target = allSnapshots.find((s) => s.number === num);

  if (!target) {
    console.error(chalk.red(`\n  snapshot #${num} not found.\n`));
    process.exit(1);
  }

  const snapshot = loadSnapshot(projectDir, target.name);
  if (!snapshot) {
    console.error(chalk.red(`\n  failed to load snapshot #${num}.\n`));
    process.exit(1);
  }

  const { meta, diffs, addedFiles } = snapshot;
  const changes = meta.changes || [];

  if (changes.length === 0) {
    console.log(chalk.yellow(`\n  snapshot #${num} has no file changes to review.\n`));
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('');
  console.log(
    chalk.bold(`  reviewing snapshot #${meta.number}: `) +
    chalk.cyan(`"${meta.label || 'unlabeled'}"`)
  );
  console.log(chalk.gray(`  ${changes.length} file change(s) to review`));

  // Track decisions: 'accept', 'reject', or 'skip'
  const decisions = new Array(changes.length).fill('skip');
  let currentIndex = 0;
  let quit = false;

  while (currentIndex < changes.length && !quit) {
    const change = changes[currentIndex];
    const header = renderChangeHeader(currentIndex + 1, changes.length, change, addedFiles);
    const preview = renderDiffPreview(change, diffs, addedFiles);

    console.log(header);
    console.log(preview);
    console.log('');
    console.log(chalk.gray('  [a]ccept  [r]eject  [s]kip  [v]iew full  [q]uit'));

    const answer = await prompt(rl, chalk.bold('  > '));

    switch (answer) {
      case 'a':
      case 'accept':
        decisions[currentIndex] = 'accept';
        console.log(chalk.green(`  -> accepted ${change.filePath}`));
        currentIndex++;
        break;

      case 'r':
      case 'reject':
        decisions[currentIndex] = 'reject';
        console.log(chalk.red(`  -> rejected ${change.filePath}`));
        currentIndex++;
        break;

      case 's':
      case 'skip':
        decisions[currentIndex] = 'skip';
        console.log(chalk.gray(`  -> skipped ${change.filePath}`));
        currentIndex++;
        break;

      case 'v':
      case 'view':
        console.log(renderFullDiff(change, diffs, addedFiles));
        // Don't advance — let user decide after viewing
        break;

      case 'q':
      case 'quit':
        quit = true;
        break;

      default:
        console.log(chalk.gray('  invalid choice. use [a]ccept, [r]eject, [s]kip, [v]iew, or [q]uit'));
        break;
    }
  }

  rl.close();

  // Summarize decisions
  const accepted = [];
  const rejected = [];
  const skipped = [];

  for (let i = 0; i < changes.length; i++) {
    if (decisions[i] === 'accept') accepted.push(changes[i]);
    else if (decisions[i] === 'reject') rejected.push(changes[i]);
    else skipped.push(changes[i]);
  }

  console.log('');
  console.log(chalk.bold('  review summary'));
  console.log(chalk.green(`    accepted: ${accepted.length} file(s)`));
  console.log(chalk.red(`    rejected: ${rejected.length} file(s)`));
  console.log(chalk.gray(`    skipped:  ${skipped.length} file(s)`));
  console.log('');

  if (rejected.length === 0) {
    console.log(chalk.green('  nothing to revert. all changes accepted or skipped.\n'));
    return;
  }

  // Apply rejections — revert those specific files
  console.log(chalk.yellow(`  reverting ${rejected.length} rejected file(s)...\n`));

  let revertedCount = 0;
  let failedCount = 0;

  for (const change of rejected) {
    const success = revertFile(projectDir, change, diffs, addedFiles);
    if (success) {
      console.log(chalk.gray(`    reverted ${change.filePath}`));
      revertedCount++;
    } else {
      console.log(chalk.red(`    failed to revert ${change.filePath}`));
      failedCount++;
    }
  }

  // Create a review snapshot to record the action
  const timestamp = Date.now();
  const id = shortId();
  const reviewName = `${timestamp}-${id}`;
  const maxNumber = Math.max(...allSnapshots.map((s) => s.number));

  const reviewMeta = {
    timestamp,
    id,
    name: reviewName,
    number: maxNumber + 1,
    label: `review of #${num}: ${accepted.length} accepted, ${rejected.length} rejected, ${skipped.length} skipped`,
    status: 'active',
    type: 'review',
    reviewedSnapshot: num,
    accepted: accepted.map((c) => c.filePath),
    rejected: rejected.map((c) => c.filePath),
    skipped: skipped.map((c) => c.filePath),
    changes: [],
    totalSize: 0,
  };

  saveSnapshot(projectDir, reviewName, reviewMeta, {}, {});
  setCurrentState(projectDir, maxNumber + 1, allSnapshots.length + 1);

  console.log('');
  console.log(chalk.green(`  review complete. ${revertedCount} file(s) reverted.`));
  if (failedCount > 0) {
    console.log(chalk.red(`  ${failedCount} file(s) failed to revert.`));
  }
  console.log(chalk.gray(`  recorded as snapshot #${maxNumber + 1}.\n`));
};
