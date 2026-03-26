const { createTempProject, addFile, modifyFile, readFile, fileExists } = require('../helpers/temp-project');
const { ChangeBuffer } = require('../../src/watcher/change-buffer');
const { rollback } = require('../../src/engine/rollback');
const { listSnapshots, loadSnapshot } = require('../../src/storage/serializer');
const store = require('../../src/storage/store');

describe('Concurrent Changes', () => {
  let project;

  beforeEach(() => {
    project = createTempProject({
      'index.js': 'const x = 1;\n',
      'utils.js': 'module.exports = {};\n',
      'config.js': 'module.exports = { port: 3000 };\n',
    });
    store.init(project.dir);
  });

  afterEach(() => {
    project.cleanup();
  });

  test('Changes during snapshot creation do not corrupt data', () => {
    const buffer = new ChangeBuffer(project.dir, { debounceMs: 50 });
    buffer.initCache(['index.js', 'utils.js', 'config.js']);

    // Rapidly create changes and snapshots in quick succession
    const snapResults = [];

    // First batch of changes
    modifyFile(project.dir, 'index.js', 'const x = 2;\n');
    addFile(project.dir, 'new1.js', 'new1\n');
    snapResults.push(buffer.createSnapshot([
      { type: 'modified', filePath: 'index.js' },
      { type: 'added', filePath: 'new1.js' },
    ]));

    // Second batch immediately after
    modifyFile(project.dir, 'utils.js', 'module.exports = { updated: true };\n');
    addFile(project.dir, 'new2.js', 'new2\n');
    snapResults.push(buffer.createSnapshot([
      { type: 'modified', filePath: 'utils.js' },
      { type: 'added', filePath: 'new2.js' },
    ]));

    // Third batch -- modify something that was just added
    modifyFile(project.dir, 'new1.js', 'new1 modified\n');
    modifyFile(project.dir, 'config.js', 'module.exports = { port: 4000 };\n');
    snapResults.push(buffer.createSnapshot([
      { type: 'modified', filePath: 'new1.js' },
      { type: 'modified', filePath: 'config.js' },
    ]));

    // All snapshots should have been created successfully
    for (const snap of snapResults) {
      expect(snap).not.toBeNull();
    }

    const all = listSnapshots(project.dir);
    expect(all).toHaveLength(3);

    // Verify each snapshot has valid data
    for (const snap of all) {
      const loaded = loadSnapshot(project.dir, snap.name);
      expect(loaded).not.toBeNull();
      expect(loaded.meta).toBeDefined();
      expect(loaded.meta.changes.length).toBeGreaterThan(0);
    }

    // Verify current file states
    expect(readFile(project.dir, 'index.js')).toBe('const x = 2;\n');
    expect(readFile(project.dir, 'utils.js')).toBe('module.exports = { updated: true };\n');
    expect(readFile(project.dir, 'new1.js')).toBe('new1 modified\n');
    expect(readFile(project.dir, 'new2.js')).toBe('new2\n');
    expect(readFile(project.dir, 'config.js')).toBe('module.exports = { port: 4000 };\n');
  });

  test('Changes during rollback: files modified after rollback starts do not break state', () => {
    const buffer = new ChangeBuffer(project.dir, { debounceMs: 50 });
    buffer.initCache(['index.js', 'utils.js', 'config.js']);

    // Create baseline snapshot
    modifyFile(project.dir, 'index.js', 'baseline\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // Create more snapshots to roll back
    addFile(project.dir, 'temp1.js', 'temp1\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'temp1.js' }]);

    addFile(project.dir, 'temp2.js', 'temp2\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'temp2.js' }]);

    modifyFile(project.dir, 'index.js', 'changed after baseline\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // Now rollback to #1
    const result = rollback(project.dir, 1);
    expect(result).toBeDefined();
    expect(result.target.number).toBe(1);

    // After rollback, temp files should be removed and index.js reverted
    expect(fileExists(project.dir, 'temp1.js')).toBe(false);
    expect(fileExists(project.dir, 'temp2.js')).toBe(false);
    expect(readFile(project.dir, 'index.js')).toBe('baseline\n');

    // Now simulate a change happening right after rollback
    addFile(project.dir, 'post-rollback.js', 'new work after rollback\n');
    const postSnap = buffer.createSnapshot([{ type: 'added', filePath: 'post-rollback.js' }]);
    expect(postSnap).not.toBeNull();

    // Everything should be consistent
    const all = listSnapshots(project.dir);
    const active = all.filter((s) => s.status === 'active');
    expect(active.length).toBeGreaterThanOrEqual(2); // snap1 + rollback + post-rollback

    expect(fileExists(project.dir, 'post-rollback.js')).toBe(true);
    expect(readFile(project.dir, 'index.js')).toBe('baseline\n');
  });

  test('Two rapid rollbacks: second rollback after first completes', () => {
    const buffer = new ChangeBuffer(project.dir, { debounceMs: 50 });
    buffer.initCache(['index.js', 'utils.js', 'config.js']);

    // Snapshot 1: modify index
    modifyFile(project.dir, 'index.js', 'step 1\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // Snapshot 2: modify utils
    modifyFile(project.dir, 'utils.js', 'step 2\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'utils.js' }]);

    // Snapshot 3: modify config
    modifyFile(project.dir, 'config.js', 'step 3\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'config.js' }]);

    // Snapshot 4: modify index again
    modifyFile(project.dir, 'index.js', 'step 4\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // First rollback: to snapshot #3
    const result1 = rollback(project.dir, 3);
    expect(result1).toBeDefined();
    expect(readFile(project.dir, 'index.js')).toBe('step 1\n'); // reverted snap4's change
    expect(readFile(project.dir, 'config.js')).toBe('step 3\n'); // snap3 untouched

    // Second rollback: to snapshot #1
    const result2 = rollback(project.dir, 1);
    expect(result2).toBeDefined();
    expect(readFile(project.dir, 'index.js')).toBe('step 1\n');
    expect(readFile(project.dir, 'utils.js')).toBe('module.exports = {};\n'); // reverted to original
    expect(readFile(project.dir, 'config.js')).toBe('module.exports = { port: 3000 };\n'); // reverted to original

    // Verify snapshot statuses
    const all = listSnapshots(project.dir);
    const rolledBack = all.filter((s) => s.status === 'rolled-back');
    // Snapshots 2, 3, 4 should all be rolled back
    expect(rolledBack.length).toBeGreaterThanOrEqual(3);

    const rollbackSnaps = all.filter((s) => s.type === 'rollback');
    expect(rollbackSnaps).toHaveLength(2);
  });
});
