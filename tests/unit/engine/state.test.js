const fs = require('fs');
const path = require('path');
const { createTempProject } = require('../../helpers/temp-project');
const store = require('../../../src/storage/store');
const { getCurrentState, setCurrentState, loadState, DEFAULT_STATE } = require('../../../src/engine/state');

describe('state', () => {
  let project;

  beforeEach(() => {
    project = createTempProject({ 'index.js': 'hello' });
    store.init(project.dir);
  });

  afterEach(() => {
    project.cleanup();
  });

  test('initial state: no snapshots', () => {
    const state = getCurrentState(project.dir);
    expect(state.current).toBeNull();
    expect(state.snapshotCount).toBe(0);
  });

  test('state after setCurrentState', () => {
    const state = setCurrentState(project.dir, 3, 5);
    expect(state.current).toBe(3);
    expect(state.snapshotCount).toBe(5);
  });

  test('getCurrentState returns correct data', () => {
    setCurrentState(project.dir, 7, 10);
    const state = getCurrentState(project.dir);
    expect(state.current).toBe(7);
    expect(state.snapshotCount).toBe(10);
  });

  test('state persists to disk', () => {
    setCurrentState(project.dir, 42, 100);

    // Read directly from disk
    const statePath = store.getStatePath(project.dir);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.current).toBe(42);
    expect(raw.snapshotCount).toBe(100);
  });

  test('corrupt state recovery', () => {
    const statePath = store.getStatePath(project.dir);
    fs.writeFileSync(statePath, '<<<CORRUPT DATA>>>', 'utf-8');

    const state = loadState(project.dir);
    expect(state).toEqual(DEFAULT_STATE);
  });

  test('default state values', () => {
    expect(DEFAULT_STATE).toEqual({ current: null, snapshotCount: 0 });

    // loadState on a project without state file returns defaults
    const freshProject = createTempProject({});
    // Don't init -- no .snaprevert directory
    // getStatePath will point to non-existent file
    store.init(freshProject.dir);
    // Remove state file to simulate missing
    const statePath = store.getStatePath(freshProject.dir);
    fs.unlinkSync(statePath);

    const state = loadState(freshProject.dir);
    expect(state.current).toBeNull();
    expect(state.snapshotCount).toBe(0);
    freshProject.cleanup();
  });
});
