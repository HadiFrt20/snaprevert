const { createTempProject, addFile, modifyFile, deleteFile, readFile, fileExists, sleep } = require('../helpers/temp-project');
const { ChangeBuffer } = require('../../src/watcher/change-buffer');
const { rollback } = require('../../src/engine/rollback');
const { restore } = require('../../src/engine/restore');
const { listSnapshots, loadSnapshot } = require('../../src/storage/serializer');
const store = require('../../src/storage/store');

describe('Rollback and Restore', () => {
  let project;

  beforeEach(() => {
    project = createTempProject({
      'index.js': 'const x = 1;\n',
      'config.js': 'module.exports = { port: 3000 };\n',
    });
    store.init(project.dir);
  });

  afterEach(() => {
    project.cleanup();
  });

  function makeBuffer() {
    const buffer = new ChangeBuffer(project.dir, { debounceMs: 50 });
    buffer.initCache(['index.js', 'config.js']);
    return buffer;
  }

  test('Create 5 snapshots, rollback to #2: files match state after snapshot #2', () => {
    const buffer = makeBuffer();

    // Snapshot 1: modify index.js
    modifyFile(project.dir, 'index.js', 'const x = 2;\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // Snapshot 2: modify config.js
    modifyFile(project.dir, 'config.js', 'module.exports = { port: 4000 };\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'config.js' }]);

    // Snapshot 3: add new file
    addFile(project.dir, 'extra.js', 'extra content\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'extra.js' }]);

    // Snapshot 4: modify index.js again
    modifyFile(project.dir, 'index.js', 'const x = 99;\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // Snapshot 5: add another file
    addFile(project.dir, 'more.js', 'more stuff\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'more.js' }]);

    // Rollback to snapshot #2
    const result = rollback(project.dir, 2);
    expect(result.filesRemoved).toBeGreaterThanOrEqual(2); // extra.js and more.js
    expect(result.filesModified).toBeGreaterThanOrEqual(1); // index.js reverted

    // index.js should be reverted to state after snapshot 2 (x = 2)
    expect(readFile(project.dir, 'index.js')).toBe('const x = 2;\n');
    // config.js should remain as after snapshot 2
    expect(readFile(project.dir, 'config.js')).toBe('module.exports = { port: 4000 };\n');
    // extra.js and more.js should be gone
    expect(fileExists(project.dir, 'extra.js')).toBe(false);
    expect(fileExists(project.dir, 'more.js')).toBe(false);
  });

  test('Rollback undoes added files', () => {
    const buffer = makeBuffer();

    // Snapshot 1: add a file
    addFile(project.dir, 'new-feature.js', 'feature code\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'new-feature.js' }]);

    // Snapshot 2: add another
    addFile(project.dir, 'another.js', 'another code\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'another.js' }]);

    expect(fileExists(project.dir, 'new-feature.js')).toBe(true);
    expect(fileExists(project.dir, 'another.js')).toBe(true);

    // Rollback to before snapshot 1 -- rollback all active snapshots
    // We need a base to roll back to. Let's create a base snapshot first.
    // Actually, target must exist. Let's restructure: create base snap, then adds, then rollback to base.

    // Re-do: start fresh
    project.cleanup();
    project = createTempProject({ 'base.js': 'base\n' });
    store.init(project.dir);

    const buf2 = new ChangeBuffer(project.dir, { debounceMs: 50 });
    buf2.initCache(['base.js']);

    // Snapshot 1: modify base
    modifyFile(project.dir, 'base.js', 'base modified\n');
    buf2.createSnapshot([{ type: 'modified', filePath: 'base.js' }]);

    // Snapshot 2: add file
    addFile(project.dir, 'added1.js', 'added1\n');
    buf2.createSnapshot([{ type: 'added', filePath: 'added1.js' }]);

    // Snapshot 3: add another
    addFile(project.dir, 'added2.js', 'added2\n');
    buf2.createSnapshot([{ type: 'added', filePath: 'added2.js' }]);

    expect(fileExists(project.dir, 'added1.js')).toBe(true);
    expect(fileExists(project.dir, 'added2.js')).toBe(true);

    rollback(project.dir, 1);

    expect(fileExists(project.dir, 'added1.js')).toBe(false);
    expect(fileExists(project.dir, 'added2.js')).toBe(false);
    expect(readFile(project.dir, 'base.js')).toBe('base modified\n');
  });

  test('Rollback restores deleted files', () => {
    const buffer = makeBuffer();

    // Snapshot 1: baseline modification
    modifyFile(project.dir, 'index.js', 'const x = 10;\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // Snapshot 2: delete config.js
    deleteFile(project.dir, 'config.js');
    buffer.createSnapshot([{ type: 'deleted', filePath: 'config.js' }]);

    expect(fileExists(project.dir, 'config.js')).toBe(false);

    // Rollback to #1 should restore config.js
    rollback(project.dir, 1);

    expect(fileExists(project.dir, 'config.js')).toBe(true);
    expect(readFile(project.dir, 'config.js')).toBe('module.exports = { port: 3000 };\n');
  });

  test('Rollback reverts modifications', () => {
    const buffer = makeBuffer();

    // Snapshot 1: first modification
    modifyFile(project.dir, 'index.js', 'const x = 100;\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // Snapshot 2: second modification
    modifyFile(project.dir, 'index.js', 'const x = 200;\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // Snapshot 3: third modification
    modifyFile(project.dir, 'index.js', 'const x = 300;\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    expect(readFile(project.dir, 'index.js')).toBe('const x = 300;\n');

    // Rollback to #1
    rollback(project.dir, 1);

    expect(readFile(project.dir, 'index.js')).toBe('const x = 100;\n');
  });

  test('Restore after rollback: rollback to #2, restore #4', () => {
    const buffer = makeBuffer();

    // Snapshot 1: modify index
    modifyFile(project.dir, 'index.js', 'const x = 10;\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // Snapshot 2: modify config
    modifyFile(project.dir, 'config.js', 'module.exports = { port: 5000 };\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'config.js' }]);

    // Snapshot 3: add file
    addFile(project.dir, 'feature.js', 'feature v1\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'feature.js' }]);

    // Snapshot 4: modify feature
    modifyFile(project.dir, 'feature.js', 'feature v2\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'feature.js' }]);

    // Rollback to #2
    rollback(project.dir, 2);
    expect(fileExists(project.dir, 'feature.js')).toBe(false);

    // Restore snapshot #3 (re-adds feature.js)
    restore(project.dir, 3);
    expect(fileExists(project.dir, 'feature.js')).toBe(true);
    expect(readFile(project.dir, 'feature.js')).toBe('feature v1\n');
  });

  test('Selective restore: only restore one rolled-back snapshot', () => {
    const buffer = makeBuffer();

    // Snapshot 1: add file A
    addFile(project.dir, 'a.js', 'aaa\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'a.js' }]);

    // Snapshot 2: add file B
    addFile(project.dir, 'b.js', 'bbb\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'b.js' }]);

    // Snapshot 3: add file C
    addFile(project.dir, 'c.js', 'ccc\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'c.js' }]);

    // Rollback to #1
    rollback(project.dir, 1);
    expect(fileExists(project.dir, 'b.js')).toBe(false);
    expect(fileExists(project.dir, 'c.js')).toBe(false);
    expect(fileExists(project.dir, 'a.js')).toBe(true);

    // Restore only #3 (c.js)
    restore(project.dir, 3);
    expect(fileExists(project.dir, 'c.js')).toBe(true);
    expect(readFile(project.dir, 'c.js')).toBe('ccc\n');
    // b.js should still be gone
    expect(fileExists(project.dir, 'b.js')).toBe(false);
  });

  test('Rollback then continue working: new snapshots after rollback', () => {
    const buffer = makeBuffer();

    // Snapshot 1
    modifyFile(project.dir, 'index.js', 'const x = 5;\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // Snapshot 2
    addFile(project.dir, 'temp.js', 'temp\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'temp.js' }]);

    // Rollback to #1
    rollback(project.dir, 1);
    expect(fileExists(project.dir, 'temp.js')).toBe(false);

    // Continue working: create new snapshot after rollback
    addFile(project.dir, 'new-work.js', 'new work\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'new-work.js' }]);

    const all = listSnapshots(project.dir);
    // Should have: snap1, snap2(rolled-back), rollback-snap, new-work-snap
    expect(all.length).toBeGreaterThanOrEqual(4);

    expect(fileExists(project.dir, 'new-work.js')).toBe(true);
    expect(readFile(project.dir, 'new-work.js')).toBe('new work\n');
  });

  test('Full cycle: create snapshots, rollback, restore, rollback again', () => {
    const buffer = makeBuffer();

    // Snapshot 1: modify index.js
    modifyFile(project.dir, 'index.js', 'step 1\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // Snapshot 2: add a new file
    addFile(project.dir, 'feature.js', 'feature v1\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'feature.js' }]);

    // Snapshot 3: add another file
    addFile(project.dir, 'helper.js', 'helper v1\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'helper.js' }]);

    // Rollback to #1: removes feature.js and helper.js
    rollback(project.dir, 1);
    expect(readFile(project.dir, 'index.js')).toBe('step 1\n');
    expect(fileExists(project.dir, 'feature.js')).toBe(false);
    expect(fileExists(project.dir, 'helper.js')).toBe(false);

    // Restore #2: re-adds feature.js
    restore(project.dir, 2);
    expect(fileExists(project.dir, 'feature.js')).toBe(true);
    expect(readFile(project.dir, 'feature.js')).toBe('feature v1\n');
    // helper.js is still gone (only #2 was restored, not #3)
    expect(fileExists(project.dir, 'helper.js')).toBe(false);

    // Verify snapshot states
    const allSnaps = listSnapshots(project.dir);
    const snap2 = allSnaps.find((s) => s.number === 2);
    expect(snap2.status).toBe('restored');
    const snap3 = allSnaps.find((s) => s.number === 3);
    expect(snap3.status).toBe('rolled-back');

    // Create a new snapshot after restore to continue working
    modifyFile(project.dir, 'index.js', 'step after restore\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    // Verify the new work is in place
    expect(readFile(project.dir, 'index.js')).toBe('step after restore\n');
    expect(fileExists(project.dir, 'feature.js')).toBe(true);

    const finalSnaps = listSnapshots(project.dir);
    expect(finalSnaps.length).toBeGreaterThanOrEqual(6); // 3 original + rollback + restore + new
  });
});
