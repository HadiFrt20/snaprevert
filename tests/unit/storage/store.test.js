const fs = require('fs');
const path = require('path');
const { createTempProject } = require('../../helpers/temp-project');
const store = require('../../../src/storage/store');

describe('store', () => {
  let project;

  beforeEach(() => {
    project = createTempProject({ 'index.js': 'console.log("hello");' });
  });

  afterEach(() => {
    project.cleanup();
  });

  test('init creates .snaprevert/ structure: config.json, snapshots/, state.json', () => {
    store.init(project.dir);

    const storePath = store.getStorePath(project.dir);
    expect(fs.existsSync(storePath)).toBe(true);
    expect(fs.existsSync(path.join(storePath, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(storePath, 'snapshots'))).toBe(true);
    expect(fs.existsSync(path.join(storePath, 'state.json'))).toBe(true);

    const config = JSON.parse(fs.readFileSync(path.join(storePath, 'config.json'), 'utf-8'));
    expect(config).toHaveProperty('max_snapshots');

    const state = JSON.parse(fs.readFileSync(path.join(storePath, 'state.json'), 'utf-8'));
    expect(state).toEqual({ current: null, snapshotCount: 0 });
  });

  test('init is idempotent: running init twice does not destroy existing data', () => {
    store.init(project.dir);

    // Write custom data into state.json
    const statePath = store.getStatePath(project.dir);
    const customState = { current: 'snap-1', snapshotCount: 5 };
    fs.writeFileSync(statePath, JSON.stringify(customState, null, 2), 'utf-8');

    // Run init again
    store.init(project.dir);

    // Custom data should still be there
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(state).toEqual(customState);
  });

  test('snapshot directory naming: format is {timestamp}-{id}, sorted chronologically', () => {
    store.init(project.dir);

    store.createSnapshotDir(project.dir, '1000000000-abc');
    store.createSnapshotDir(project.dir, '1000000002-def');
    store.createSnapshotDir(project.dir, '1000000001-ghi');

    const dirs = store.getSnapshotDirs(project.dir);
    expect(dirs).toEqual([
      '1000000000-abc',
      '1000000001-ghi',
      '1000000002-def',
    ]);
  });

  test('createSnapshotDir creates meta.json-ready dir and diffs/ subdirectory', () => {
    store.init(project.dir);

    const snapshotPath = store.createSnapshotDir(project.dir, '1700000000-snap1');

    expect(fs.existsSync(snapshotPath)).toBe(true);
    expect(fs.existsSync(path.join(snapshotPath, 'diffs'))).toBe(true);
    expect(fs.existsSync(path.join(snapshotPath, 'added'))).toBe(true);
    expect(fs.statSync(snapshotPath).isDirectory()).toBe(true);
  });

  test('deleteSnapshotDir removes entire snapshot directory', () => {
    store.init(project.dir);

    const snapshotPath = store.createSnapshotDir(project.dir, '1700000000-snap1');
    // Write a file inside to confirm recursive deletion
    fs.writeFileSync(path.join(snapshotPath, 'diffs', 'test.diff'), 'diff content', 'utf-8');

    expect(fs.existsSync(snapshotPath)).toBe(true);

    store.deleteSnapshotDir(project.dir, '1700000000-snap1');

    expect(fs.existsSync(snapshotPath)).toBe(false);
  });

  test('getSnapshotCount returns correct count', () => {
    store.init(project.dir);

    expect(store.getSnapshotCount(project.dir)).toBe(0);

    store.createSnapshotDir(project.dir, '1700000000-a');
    expect(store.getSnapshotCount(project.dir)).toBe(1);

    store.createSnapshotDir(project.dir, '1700000001-b');
    store.createSnapshotDir(project.dir, '1700000002-c');
    expect(store.getSnapshotCount(project.dir)).toBe(3);

    store.deleteSnapshotDir(project.dir, '1700000001-b');
    expect(store.getSnapshotCount(project.dir)).toBe(2);
  });

  test('getTotalSize returns sum of all snapshot sizes in bytes', () => {
    store.init(project.dir);

    expect(store.getTotalSize(project.dir)).toBe(0);

    const snapshotPath = store.createSnapshotDir(project.dir, '1700000000-a');
    const content1 = 'abcdefghij'; // 10 bytes
    const content2 = '12345'; // 5 bytes
    fs.writeFileSync(path.join(snapshotPath, 'diffs', 'file1.diff'), content1, 'utf-8');
    fs.writeFileSync(path.join(snapshotPath, 'diffs', 'file2.diff'), content2, 'utf-8');

    const totalSize = store.getTotalSize(project.dir);
    expect(totalSize).toBe(15);
  });

  test('isInitialized returns false for missing .snaprevert/', () => {
    expect(store.isInitialized(project.dir)).toBe(false);

    store.init(project.dir);
    expect(store.isInitialized(project.dir)).toBe(true);
  });

  test('handles corrupt state.json by recovering to default state', () => {
    store.init(project.dir);

    // Corrupt the state file
    const statePath = store.getStatePath(project.dir);
    fs.writeFileSync(statePath, '{{{not valid json!!!', 'utf-8');

    // Delete .snaprevert and re-init to recover
    fs.rmSync(store.getStorePath(project.dir), { recursive: true, force: true });
    store.init(project.dir);

    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(state).toEqual({ current: null, snapshotCount: 0 });
  });
});
