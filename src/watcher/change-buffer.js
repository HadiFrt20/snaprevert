/**
 * Collects file change events during a debounce window.
 * Deduplicates and classifies changes.
 */

const fs = require('fs');
const path = require('path');
const { computeDiff } = require('../storage/differ');
const { saveSnapshot, listSnapshots } = require('../storage/serializer');
const { init, getSnapshotsPath } = require('../storage/store');
const { shortId } = require('../utils/hash');
const { generateLabel } = require('../utils/labeler');
const { loadConfig } = require('../utils/config');

class ChangeBuffer {
  constructor(projectDir, options = {}) {
    this.projectDir = projectDir;
    this.debounceMs = options.debounceMs || 3000;
    this.maxFileSizeKb = options.maxFileSizeKb || 1024;
    this.onSnapshot = options.onSnapshot || (() => {});
    this.changes = new Map(); // filePath -> { type, filePath }
    this.timer = null;
    this.fileContents = new Map(); // Cache of file contents at last snapshot
  }

  add(type, filePath) {
    const rel = path.relative(this.projectDir, filePath).replace(/\\/g, '/');

    // Handle sequential events for same file
    const existing = this.changes.get(rel);
    if (existing) {
      if (existing.type === 'added' && type === 'deleted') {
        // Added then deleted in same window = no net change
        this.changes.delete(rel);
      } else if (existing.type === 'added' && type === 'modified') {
        // Added then modified = still added
        // Keep as added
      } else if (type === 'deleted') {
        this.changes.set(rel, { type: 'deleted', filePath: rel });
      } else {
        this.changes.set(rel, { type: existing.type === 'added' ? 'added' : 'modified', filePath: rel });
      }
    } else {
      this.changes.set(rel, { type, filePath: rel });
    }

    // Reset debounce timer
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  async flush() {
    if (this.changes.size === 0) return null;

    const changes = Array.from(this.changes.values());
    this.changes.clear();
    this.timer = null;

    return this.createSnapshot(changes);
  }

  createSnapshot(changes) {
    init(this.projectDir);

    const config = loadConfig(this.projectDir);
    const timestamp = Date.now();
    const id = shortId();
    const snapshotName = `${timestamp}-${id}`;

    const diffs = {};
    const addedFiles = {};
    const deletedFiles = [];
    const fileChanges = [];

    for (const change of changes) {
      const absPath = path.join(this.projectDir, change.filePath);

      if (change.type === 'added') {
        try {
          const stat = fs.statSync(absPath);
          if (stat.size > config.max_file_size_kb * 1024) {
            continue; // Skip large files
          }
          const content = fs.readFileSync(absPath, 'utf-8');
          addedFiles[change.filePath] = content;
          this.fileContents.set(change.filePath, content);
          fileChanges.push({ type: 'added', filePath: change.filePath, size: stat.size });
        } catch {
          continue; // File may have been deleted between detection and snapshot
        }
      } else if (change.type === 'modified') {
        try {
          const stat = fs.statSync(absPath);
          if (stat.size > config.max_file_size_kb * 1024) {
            continue;
          }
          const newContent = fs.readFileSync(absPath, 'utf-8');
          const oldContent = this.fileContents.get(change.filePath) || '';
          const diff = computeDiff(oldContent, newContent);
          if (diff) {
            diffs[change.filePath] = diff;
            fileChanges.push({ type: 'modified', filePath: change.filePath, size: stat.size });
          }
          this.fileContents.set(change.filePath, newContent);
        } catch {
          continue;
        }
      } else if (change.type === 'deleted') {
        const oldContent = this.fileContents.get(change.filePath) || '';
        deletedFiles.push({ filePath: change.filePath, content: oldContent });
        fileChanges.push({ type: 'deleted', filePath: change.filePath });
        this.fileContents.delete(change.filePath);
      }
    }

    if (fileChanges.length === 0) return null;

    const label = generateLabel(fileChanges);

    const meta = {
      timestamp,
      id,
      name: snapshotName,
      number: this.getNextNumber(),
      label,
      status: 'active',
      changes: fileChanges,
      deletedFiles: deletedFiles.map((d) => ({ filePath: d.filePath })),
      totalSize: 0,
    };

    // Store deleted file contents in added/ (so we can restore them)
    for (const del of deletedFiles) {
      if (del.content) {
        addedFiles['__deleted__/' + del.filePath] = del.content;
      }
    }

    saveSnapshot(this.projectDir, snapshotName, meta, diffs, addedFiles);

    // Calculate total size
    const snapDir = path.join(getSnapshotsPath(this.projectDir), snapshotName);
    meta.totalSize = dirSize(snapDir);
    // Update meta with size
    const metaPath = path.join(snapDir, 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

    this.onSnapshot(meta);
    return meta;
  }

  getNextNumber() {
    const snapshots = listSnapshots(this.projectDir);
    if (snapshots.length === 0) return 1;
    return Math.max(...snapshots.map((s) => s.number || 0)) + 1;
  }

  /**
   * Initialize file content cache from current project state.
   */
  initCache(files) {
    for (const filePath of files) {
      try {
        const absPath = path.join(this.projectDir, filePath);
        const content = fs.readFileSync(absPath, 'utf-8');
        this.fileContents.set(filePath, content);
      } catch {
        // Skip unreadable files
      }
    }
  }

  clear() {
    this.changes.clear();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

function dirSize(dir) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        total += dirSize(fullPath);
      } else {
        total += stat.size;
      }
    }
  } catch {
    // ignore
  }
  return total;
}

module.exports = { ChangeBuffer };
