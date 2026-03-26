/**
 * Read/write snapshot data to disk.
 */

const fs = require('fs');
const path = require('path');
const store = require('./store');

// Encode file paths for safe filesystem storage (reversible)
function encodePath(filePath) {
  return filePath.replace(/%/g, '%25').replace(/[/\\]/g, '%2F');
}

function decodePath(safePath) {
  return safePath.replace(/%2F/g, '/').replace(/%25/g, '%');
}

function saveSnapshot(projectDir, snapshotName, meta, diffs, addedFiles) {
  const snapshotPath = store.createSnapshotDir(projectDir, snapshotName);

  // Save meta
  fs.writeFileSync(
    path.join(snapshotPath, 'meta.json'),
    JSON.stringify(meta, null, 2),
    'utf-8'
  );

  // Save diffs for modified files
  if (diffs) {
    for (const [filePath, diffContent] of Object.entries(diffs)) {
      const safePath = encodePath(filePath);
      fs.writeFileSync(
        path.join(snapshotPath, 'diffs', safePath + '.diff'),
        diffContent,
        'utf-8'
      );
    }
  }

  // Save full content of added files
  if (addedFiles) {
    for (const [filePath, content] of Object.entries(addedFiles)) {
      const safePath = encodePath(filePath);
      fs.writeFileSync(
        path.join(snapshotPath, 'added', safePath),
        content,
        'utf-8'
      );
    }
  }

  return snapshotPath;
}

function loadSnapshot(projectDir, snapshotName) {
  const snapshotPath = path.join(store.getSnapshotsPath(projectDir), snapshotName);

  if (!fs.existsSync(snapshotPath)) {
    return null;
  }

  // Load meta
  const metaPath = path.join(snapshotPath, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    return null;
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {
    return null;
  }

  // Load diffs
  const diffs = {};
  const diffsDir = path.join(snapshotPath, 'diffs');
  if (fs.existsSync(diffsDir)) {
    for (const file of fs.readdirSync(diffsDir)) {
      if (file.endsWith('.diff')) {
        const filePath = decodePath(file.slice(0, -5));
        diffs[filePath] = fs.readFileSync(path.join(diffsDir, file), 'utf-8');
      }
    }
  }

  // Load added files
  const addedFiles = {};
  const addedDir = path.join(snapshotPath, 'added');
  if (fs.existsSync(addedDir)) {
    for (const file of fs.readdirSync(addedDir)) {
      const filePath = decodePath(file);
      addedFiles[filePath] = fs.readFileSync(path.join(addedDir, file), 'utf-8');
    }
  }

  return { meta, diffs, addedFiles };
}

function listSnapshots(projectDir) {
  const dirs = store.getSnapshotDirs(projectDir);
  const snapshots = [];

  for (const dir of dirs) {
    const metaPath = path.join(store.getSnapshotsPath(projectDir), dir, 'meta.json');
    try {
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        snapshots.push(meta);
      }
    } catch {
      // Skip corrupt snapshots
    }
  }

  // Sort by number (stable ordering even when timestamps collide)
  snapshots.sort((a, b) => (a.number || 0) - (b.number || 0));
  return snapshots;
}

function updateSnapshotMeta(projectDir, snapshotName, updates) {
  const metaPath = path.join(store.getSnapshotsPath(projectDir), snapshotName, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    throw new Error(`Snapshot not found: ${snapshotName}`);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  Object.assign(meta, updates);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  return meta;
}

module.exports = { saveSnapshot, loadSnapshot, listSnapshots, updateSnapshotMeta };
