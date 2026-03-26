/**
 * Rollback algorithm — undo snapshots to return to a previous state.
 */

const fs = require('fs');
const path = require('path');
const { listSnapshots, loadSnapshot, updateSnapshotMeta, saveSnapshot } = require('../storage/serializer');
const { init } = require('../storage/store');
const { applyDiff, reverseDiff } = require('../storage/differ');
const { shortId } = require('../utils/hash');
const { setCurrentState } = require('./state');

function rollback(projectDir, targetNumber, options = {}) {
  init(projectDir);

  const snapshots = listSnapshots(projectDir);
  const target = snapshots.find((s) => s.number === targetNumber);

  if (!target) {
    throw new Error(`Snapshot #${targetNumber} not found`);
  }

  // Find snapshots to undo (everything after target)
  const toUndo = snapshots
    .filter((s) => s.number > targetNumber && s.status === 'active')
    .sort((a, b) => b.number - a.number); // Reverse order (newest first)

  if (toUndo.length === 0) {
    throw new Error(`No active snapshots after #${targetNumber} to undo`);
  }

  if (options.dry) {
    return {
      target,
      toUndo,
      filesRemoved: 0,
      filesModified: 0,
      filesRestored: 0,
    };
  }

  let filesRemoved = 0;
  let filesModified = 0;
  let filesRestored = 0;

  // Undo each snapshot in reverse order
  for (const snap of toUndo) {
    const snapshot = loadSnapshot(projectDir, snap.name);
    if (!snapshot) continue;

    const { meta, diffs, addedFiles } = snapshot;

    for (const change of meta.changes || []) {
      const absPath = path.join(projectDir, change.filePath);

      if (change.type === 'added') {
        // Undo add = delete the file
        try {
          if (fs.existsSync(absPath)) {
            fs.unlinkSync(absPath);
            // Clean up empty directories
            cleanEmptyDirs(path.dirname(absPath), projectDir);
            filesRemoved++;
          }
        } catch {
          // Best effort
        }
      } else if (change.type === 'modified') {
        // Undo modify = apply reverse diff
        const diff = diffs[change.filePath];
        if (diff) {
          try {
            const currentContent = fs.readFileSync(absPath, 'utf-8');
            const reversed = reverseDiff(diff);
            const restored = applyDiff(currentContent, reversed);
            fs.writeFileSync(absPath, restored, 'utf-8');
            filesModified++;
          } catch {
            // Best effort
          }
        }
      } else if (change.type === 'deleted') {
        // Undo delete = restore the file
        const deletedContent = addedFiles['__deleted__/' + change.filePath];
        if (deletedContent !== undefined) {
          try {
            const dir = path.dirname(absPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(absPath, deletedContent, 'utf-8');
            filesRestored++;
          } catch {
            // Best effort
          }
        }
      }
    }

    // Mark snapshot as rolled-back
    updateSnapshotMeta(projectDir, snap.name, { status: 'rolled-back' });
  }

  // Create a rollback snapshot to record the action
  const timestamp = Date.now();
  const id = shortId();
  const rollbackName = `${timestamp}-${id}`;
  const rollbackMeta = {
    timestamp,
    id,
    name: rollbackName,
    number: Math.max(...snapshots.map((s) => s.number)) + 1,
    label: `rollback to #${targetNumber}`,
    status: 'active',
    type: 'rollback',
    rollbackTarget: targetNumber,
    undoneSnapshots: toUndo.map((s) => s.number),
    changes: [],
    totalSize: 0,
  };

  saveSnapshot(projectDir, rollbackName, rollbackMeta, {}, {});

  setCurrentState(projectDir, targetNumber, snapshots.length + 1);

  return {
    target,
    toUndo,
    filesRemoved,
    filesModified,
    filesRestored,
  };
}

function cleanEmptyDirs(dir, stopAt) {
  try {
    while (dir !== stopAt && dir.startsWith(stopAt)) {
      const entries = fs.readdirSync(dir);
      if (entries.length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      } else {
        break;
      }
    }
  } catch {
    // Best effort
  }
}

module.exports = { rollback };
