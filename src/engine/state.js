/**
 * State tracking — current pointer, snapshot statuses.
 */

const fs = require('fs');
const { getStatePath } = require('../storage/store');

const DEFAULT_STATE = { current: null, snapshotCount: 0 };

function loadState(projectDir) {
  const statePath = getStatePath(projectDir);
  try {
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    }
  } catch {
    // Corrupt state — return default
  }
  return { ...DEFAULT_STATE };
}

function saveState(projectDir, state) {
  const statePath = getStatePath(projectDir);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

function getCurrentState(projectDir) {
  return loadState(projectDir);
}

function setCurrentState(projectDir, current, snapshotCount) {
  const state = loadState(projectDir);
  if (current !== undefined) state.current = current;
  if (snapshotCount !== undefined) state.snapshotCount = snapshotCount;
  saveState(projectDir, state);
  return state;
}

module.exports = { loadState, saveState, getCurrentState, setCurrentState, DEFAULT_STATE };
