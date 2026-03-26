/**
 * Export a snapshot as a patch (unified diff) or JSON.
 */

const fs = require('fs');
const { loadSnapshot, listSnapshots } = require('../storage/serializer');

function formatUnifiedDiff(diffs, addedFiles) {
  const parts = [];

  // Modified files — wrap each raw diff with proper unified headers
  for (const [filePath, diffContent] of Object.entries(diffs)) {
    parts.push(`--- a/${filePath}`);
    parts.push(`+++ b/${filePath}`);
    parts.push(diffContent);
  }

  // Added files — represent as new-file diffs
  for (const [filePath, content] of Object.entries(addedFiles)) {
    // Skip internal deleted-file backups
    if (filePath.startsWith('__deleted__/')) continue;

    const lines = content.split('\n');
    parts.push(`--- /dev/null`);
    parts.push(`+++ b/${filePath}`);
    parts.push(`@@ -0,0 +1,${lines.length} @@`);
    for (const line of lines) {
      parts.push(`+${line}`);
    }
  }

  return parts.join('\n') + '\n';
}

function findSnapshotByNumber(projectDir, number) {
  const snapshots = listSnapshots(projectDir);
  return snapshots.find((s) => s.number === number);
}

async function exportCommand(number, opts) {
  const projectDir = process.cwd();
  const num = parseInt(number, 10);

  if (isNaN(num)) {
    console.error('Error: snapshot number must be an integer');
    process.exit(1);
  }

  const snapshotMeta = findSnapshotByNumber(projectDir, num);
  if (!snapshotMeta) {
    console.error(`Error: snapshot #${num} not found`);
    process.exit(1);
  }

  const snapshot = loadSnapshot(projectDir, snapshotMeta.name);
  if (!snapshot) {
    console.error(`Error: could not load snapshot #${num}`);
    process.exit(1);
  }

  if (opts.json) {
    const output = JSON.stringify(snapshot, null, 2);
    if (opts.file) {
      fs.writeFileSync(opts.file, output, 'utf-8');
      console.log(`JSON written to ${opts.file}`);
    } else {
      process.stdout.write(output + '\n');
    }
    return;
  }

  // Default: patch mode
  const patch = formatUnifiedDiff(snapshot.diffs || {}, snapshot.addedFiles || {});

  if (opts.file) {
    fs.writeFileSync(opts.file, patch, 'utf-8');
    console.log(`Patch written to ${opts.file}`);
  } else {
    process.stdout.write(patch);
  }
}

module.exports = exportCommand;
