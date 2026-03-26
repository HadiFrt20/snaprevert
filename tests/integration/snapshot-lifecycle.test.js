const { createTempProject, addFile, modifyFile, deleteFile } = require('../helpers/temp-project');
const { ChangeBuffer } = require('../../src/watcher/change-buffer');
const { listSnapshots, loadSnapshot } = require('../../src/storage/serializer');
const store = require('../../src/storage/store');

describe('Snapshot Lifecycle (manual via ChangeBuffer)', () => {
  let project;

  beforeEach(() => {
    project = createTempProject({
      'index.js': 'console.log("hello");\n',
      'utils.js': 'module.exports = {};\n',
      'readme.txt': 'Read me\n',
    });
    store.init(project.dir);
  });

  afterEach(() => {
    project.cleanup();
  });

  function makeBuffer(cachedFiles) {
    const buffer = new ChangeBuffer(project.dir, { debounceMs: 50 });
    if (cachedFiles) {
      buffer.initCache(cachedFiles);
    }
    return buffer;
  }

  test('Create 5 snapshots with different file changes, verify all stored', () => {
    const buffer = makeBuffer(['index.js', 'utils.js', 'readme.txt']);

    // Snapshot 1: add a new file
    addFile(project.dir, 'app.js', 'const app = 1;\n');
    const snap1 = buffer.createSnapshot([{ type: 'added', filePath: 'app.js' }]);
    expect(snap1).not.toBeNull();

    // Snapshot 2: modify index.js
    modifyFile(project.dir, 'index.js', 'console.log("world");\n');
    const snap2 = buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);
    expect(snap2).not.toBeNull();

    // Snapshot 3: delete readme.txt
    deleteFile(project.dir, 'readme.txt');
    const snap3 = buffer.createSnapshot([{ type: 'deleted', filePath: 'readme.txt' }]);
    expect(snap3).not.toBeNull();

    // Snapshot 4: add two files
    addFile(project.dir, 'lib/a.js', 'a\n');
    addFile(project.dir, 'lib/b.js', 'b\n');
    const snap4 = buffer.createSnapshot([
      { type: 'added', filePath: 'lib/a.js' },
      { type: 'added', filePath: 'lib/b.js' },
    ]);
    expect(snap4).not.toBeNull();

    // Snapshot 5: modify utils.js
    modifyFile(project.dir, 'utils.js', 'module.exports = { x: 1 };\n');
    const snap5 = buffer.createSnapshot([{ type: 'modified', filePath: 'utils.js' }]);
    expect(snap5).not.toBeNull();

    const all = listSnapshots(project.dir);
    expect(all).toHaveLength(5);
    expect(all.map((s) => s.number)).toEqual([
      snap1.number, snap2.number, snap3.number, snap4.number, snap5.number,
    ]);
  });

  test('List returns correct chronological order', () => {
    const buffer = makeBuffer(['index.js']);

    addFile(project.dir, 'first.js', 'first\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'first.js' }]);

    modifyFile(project.dir, 'index.js', 'updated\n');
    buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    addFile(project.dir, 'last.js', 'last\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'last.js' }]);

    const all = listSnapshots(project.dir);
    expect(all).toHaveLength(3);

    // Timestamps should be non-decreasing
    for (let i = 1; i < all.length; i++) {
      expect(all[i].timestamp).toBeGreaterThanOrEqual(all[i - 1].timestamp);
    }

    // Numbers should be strictly increasing
    for (let j = 1; j < all.length; j++) {
      expect(all[j].number).toBeGreaterThan(all[j - 1].number);
    }
  });

  test('Diff shows correct changes for a specific snapshot', () => {
    const buffer = makeBuffer(['index.js']);

    modifyFile(project.dir, 'index.js', 'console.log("changed");\n');
    const snap = buffer.createSnapshot([{ type: 'modified', filePath: 'index.js' }]);

    const loaded = loadSnapshot(project.dir, snap.name);
    expect(loaded).not.toBeNull();
    expect('index.js' in loaded.diffs).toBe(true);

    const diff = loaded.diffs['index.js'];
    expect(diff).toContain('-console.log("hello");');
    expect(diff).toContain('+console.log("changed");');
  });

  test('Delete old snapshot, verify others intact', () => {
    const buffer = makeBuffer(['index.js']);

    addFile(project.dir, 'a.js', 'a\n');
    const snap1 = buffer.createSnapshot([{ type: 'added', filePath: 'a.js' }]);

    addFile(project.dir, 'b.js', 'b\n');
    const snap2 = buffer.createSnapshot([{ type: 'added', filePath: 'b.js' }]);

    addFile(project.dir, 'c.js', 'c\n');
    const snap3 = buffer.createSnapshot([{ type: 'added', filePath: 'c.js' }]);

    // Delete the first snapshot
    store.deleteSnapshotDir(project.dir, snap1.name);

    const remaining = listSnapshots(project.dir);
    expect(remaining).toHaveLength(2);
    expect(remaining.map((s) => s.number)).toEqual([snap2.number, snap3.number]);

    // Verify data integrity of remaining snapshots
    const loaded2 = loadSnapshot(project.dir, snap2.name);
    expect(loaded2).not.toBeNull();
    expect('b.js' in loaded2.addedFiles).toBe(true);

    const loaded3 = loadSnapshot(project.dir, snap3.name);
    expect(loaded3).not.toBeNull();
    expect('c.js' in loaded3.addedFiles).toBe(true);
  });

  test('Storage size tracks correctly', () => {
    const buffer = makeBuffer([]);

    const sizeBefore = store.getTotalSize(project.dir);

    addFile(project.dir, 'big.js', 'x'.repeat(1000) + '\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'big.js' }]);

    const sizeAfter = store.getTotalSize(project.dir);
    expect(sizeAfter).toBeGreaterThan(sizeBefore);

    addFile(project.dir, 'big2.js', 'y'.repeat(2000) + '\n');
    buffer.createSnapshot([{ type: 'added', filePath: 'big2.js' }]);

    const sizeAfter2 = store.getTotalSize(project.dir);
    expect(sizeAfter2).toBeGreaterThan(sizeAfter);
  });

  test('Snapshot IDs are unique across 100 rapid snapshots', () => {
    const buffer = makeBuffer([]);

    const ids = new Set();
    const names = new Set();

    for (let i = 0; i < 100; i++) {
      addFile(project.dir, `file${i}.js`, `content ${i}\n`);
      const snap = buffer.createSnapshot([{ type: 'added', filePath: `file${i}.js` }]);
      expect(snap).not.toBeNull();
      ids.add(snap.id);
      names.add(snap.name);
    }

    expect(ids.size).toBe(100);
    expect(names.size).toBe(100);

    const all = listSnapshots(project.dir);
    expect(all).toHaveLength(100);
  });
});
