/**
 * Restore algorithm — re-apply a previously rolled-back snapshot.
 */

const fs = require('fs');
const path = require('path');
const { listSnapshots, loadSnapshot, updateSnapshotMeta, saveSnapshot } = require('../storage/serializer');
const { init } = require('../storage/store');
const { applyDiff } = require('../storage/differ');
const { shortId } = require('../utils/hash');

function restore(projectDir, targetNumber) {
  init(projectDir);

  const snapshots = listSnapshots(projectDir);
  const target = snapshots.find((s) => s.number === targetNumber);

  if (!target) {
    throw new Error(`Snapshot #${targetNumber} not found`);
  }

  if (target.status !== 'rolled-back') {
    throw new Error(`Snapshot #${targetNumber} is not rolled back (status: ${target.status})`);
  }

  const snapshot = loadSnapshot(projectDir, target.name);
  if (!snapshot) {
    throw new Error(`Could not load snapshot #${targetNumber}`);
  }

  const { meta, diffs, addedFiles } = snapshot;

  // Re-apply changes
  for (const change of meta.changes || []) {
    const absPath = path.join(projectDir, change.filePath);

    if (change.type === 'added') {
      // Re-add the file
      const content = addedFiles[change.filePath];
      if (content !== undefined) {
        const dir = path.dirname(absPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(absPath, content, 'utf-8');
      }
    } else if (change.type === 'modified') {
      // Re-apply the diff
      const diff = diffs[change.filePath];
      if (diff) {
        try {
          const currentContent = fs.readFileSync(absPath, 'utf-8');
          const newContent = applyDiff(currentContent, diff);
          fs.writeFileSync(absPath, newContent, 'utf-8');
        } catch {
          // Best effort
        }
      }
    } else if (change.type === 'deleted') {
      // Re-delete the file
      try {
        if (fs.existsSync(absPath)) {
          fs.unlinkSync(absPath);
        }
      } catch {
        // Best effort
      }
    }
  }

  // Mark as restored
  updateSnapshotMeta(projectDir, target.name, { status: 'restored' });

  // Create a restore snapshot
  const timestamp = Date.now();
  const id = shortId();
  const restoreName = `${timestamp}-${id}`;
  const restoreMeta = {
    timestamp,
    id,
    name: restoreName,
    number: Math.max(...snapshots.map((s) => s.number)) + 1,
    label: `restored #${targetNumber}`,
    status: 'active',
    type: 'restore',
    restoredSnapshot: targetNumber,
    changes: [],
    totalSize: 0,
  };

  saveSnapshot(projectDir, restoreName, restoreMeta, {}, {});

  return {
    restored: target,
    changes: meta.changes || [],
  };
}

module.exports = { restore };
