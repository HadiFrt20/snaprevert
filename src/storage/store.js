/**
 * Manages the .snaprevert/ directory structure.
 */

const fs = require('fs');
const path = require('path');
const { DEFAULTS } = require('../utils/config');

const STORE_DIR = '.snaprevert';
const SNAPSHOTS_DIR = 'snapshots';
const CONFIG_FILE = 'config.json';
const STATE_FILE = 'state.json';

function getStorePath(projectDir) {
  return path.join(projectDir, STORE_DIR);
}

function getSnapshotsPath(projectDir) {
  return path.join(projectDir, STORE_DIR, SNAPSHOTS_DIR);
}

function getStatePath(projectDir) {
  return path.join(projectDir, STORE_DIR, STATE_FILE);
}

function getConfigPath(projectDir) {
  return path.join(projectDir, STORE_DIR, CONFIG_FILE);
}

function isInitialized(projectDir) {
  return fs.existsSync(getStorePath(projectDir));
}

function init(projectDir) {
  const storePath = getStorePath(projectDir);
  const snapshotsPath = getSnapshotsPath(projectDir);
  const configPath = getConfigPath(projectDir);
  const statePath = getStatePath(projectDir);

  // Idempotent — don't destroy existing data
  if (!fs.existsSync(storePath)) {
    fs.mkdirSync(storePath, { recursive: true });
  }
  if (!fs.existsSync(snapshotsPath)) {
    fs.mkdirSync(snapshotsPath, { recursive: true });
  }
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULTS, null, 2), 'utf-8');
  }
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, JSON.stringify({ current: null, snapshotCount: 0 }, null, 2), 'utf-8');
  }
}

function getSnapshotDirs(projectDir) {
  const snapshotsPath = getSnapshotsPath(projectDir);
  if (!fs.existsSync(snapshotsPath)) return [];

  return fs.readdirSync(snapshotsPath)
    .filter((name) => {
      const fullPath = path.join(snapshotsPath, name);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort(); // Timestamp-prefixed names sort chronologically
}

function getSnapshotCount(projectDir) {
  return getSnapshotDirs(projectDir).length;
}

function getTotalSize(projectDir) {
  const snapshotsPath = getSnapshotsPath(projectDir);
  if (!fs.existsSync(snapshotsPath)) return 0;

  let total = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        total += stat.size;
      }
    }
  }
  walk(snapshotsPath);
  return total;
}

function createSnapshotDir(projectDir, name) {
  const snapshotPath = path.join(getSnapshotsPath(projectDir), name);
  fs.mkdirSync(snapshotPath, { recursive: true });
  fs.mkdirSync(path.join(snapshotPath, 'diffs'), { recursive: true });
  fs.mkdirSync(path.join(snapshotPath, 'added'), { recursive: true });
  return snapshotPath;
}

function deleteSnapshotDir(projectDir, name) {
  const snapshotPath = path.join(getSnapshotsPath(projectDir), name);
  if (fs.existsSync(snapshotPath)) {
    fs.rmSync(snapshotPath, { recursive: true, force: true });
  }
}

module.exports = {
  STORE_DIR,
  getStorePath,
  getSnapshotsPath,
  getStatePath,
  getConfigPath,
  isInitialized,
  init,
  getSnapshotDirs,
  getSnapshotCount,
  getTotalSize,
  createSnapshotDir,
  deleteSnapshotDir,
};
