const { createTempProject, addFile, fileExists, readFile } = require('../../helpers/temp-project');
const store = require('../../../src/storage/store');
const { saveSnapshot, listSnapshots } = require('../../../src/storage/serializer');
const { restore } = require('../../../src/engine/restore');
const { rollback } = require('../../../src/engine/rollback');

describe('restore', () => {
  let project;

  beforeEach(() => {
    project = createTempProject({ 'index.js': 'console.log("hello");' });
    store.init(project.dir);
  });

  afterEach(() => {
    project.cleanup();
  });

  function createAddedSnapshot(number, filePath, content, timestamp) {
    const ts = timestamp || Date.now() + number;
    const name = `${ts}-snap${number}`;
    addFile(project.dir, filePath, content);
    const meta = {
      timestamp: ts, id: `snap${number}`, name, number,
      label: `snapshot #${number}`, status: 'active', type: 'snapshot',
      changes: [{ filePath, type: 'added' }],
      totalSize: content.length,
    };
    saveSnapshot(project.dir, name, meta, {}, { [filePath]: content });
    return name;
  }

  function createBareSnapshot(number, timestamp) {
    const ts = timestamp || Date.now() + number;
    const name = `${ts}-snap${number}`;
    const meta = {
      timestamp: ts, id: `snap${number}`, name, number,
      label: `snapshot #${number}`, status: 'active', type: 'snapshot',
      changes: [], totalSize: 0,
    };
    saveSnapshot(project.dir, name, meta, {}, {});
    return name;
  }

  test('restore a rolled-back snapshot', () => {
    createBareSnapshot(1, 1000000001);
    createAddedSnapshot(2, 'feature.js', 'feature code', 1000000002);

    rollback(project.dir, 1);
    expect(fileExists(project.dir, 'feature.js')).toBe(false);

    const result = restore(project.dir, 2);
    expect(result.restored.number).toBe(2);
    expect(fileExists(project.dir, 'feature.js')).toBe(true);
    expect(readFile(project.dir, 'feature.js')).toBe('feature code');
  });

  test('restore updates snapshot status to restored', () => {
    createAddedSnapshot(1, 'base.js', 'base', 1000000001);
    createAddedSnapshot(2, 'extra.js', 'extra', 1000000002);

    rollback(project.dir, 1);

    restore(project.dir, 2);

    const snapshots = listSnapshots(project.dir);
    const snap2 = snapshots.find((s) => s.number === 2);
    expect(snap2.status).toBe('restored');
  });

  test('restore creates new snapshot', () => {
    createBareSnapshot(1, 1000000001);
    createAddedSnapshot(2, 'file.js', 'data', 1000000002);

    rollback(project.dir, 1);

    restore(project.dir, 2);

    const snapshots = listSnapshots(project.dir);
    const restoreSnap = snapshots.find((s) => s.type === 'restore');
    expect(restoreSnap).toBeDefined();
    expect(restoreSnap.status).toBe('active');
    expect(restoreSnap.label).toContain('restored #2');
    expect(restoreSnap.restoredSnapshot).toBe(2);
  });

  test('restore active snapshot: error', () => {
    createBareSnapshot(1, 1000000001);
    createAddedSnapshot(2, 'file.js', 'data', 1000000002);

    expect(() => restore(project.dir, 2)).toThrow('is not rolled back');
  });

  test('restore non-existent snapshot: error', () => {
    createBareSnapshot(1, 1000000001);

    expect(() => restore(project.dir, 99)).toThrow('Snapshot #99 not found');
  });

  test('restore then rollback again', () => {
    createBareSnapshot(1, 1000000001);
    createAddedSnapshot(2, 'file.js', 'data', 1000000002);

    // Rollback to 1
    rollback(project.dir, 1);
    expect(fileExists(project.dir, 'file.js')).toBe(false);

    // Restore snapshot 2
    restore(project.dir, 2);
    expect(fileExists(project.dir, 'file.js')).toBe(true);

    // Rollback again to 1 -- this undoes the restore snapshot and any active snapshots after 1
    // The restore snapshot is active (#4), snapshot #2 is now 'restored', snapshot #3 (rollback) is active
    // Rolling back to 1 should undo active snapshots #3 and #4
    const snapsBefore = listSnapshots(project.dir);
    const activeAfter1 = snapsBefore.filter((s) => s.number > 1 && s.status === 'active');
    expect(activeAfter1.length).toBeGreaterThan(0);

    const result = rollback(project.dir, 1);
    expect(result.toUndo.length).toBeGreaterThan(0);

    const snapsAfter = listSnapshots(project.dir);
    // All originally active snapshots after #1 should now be rolled back
    snapsAfter.filter(
      (s) => s.number > 1 && s.status === 'active' && s.type !== 'rollback'
    );
    // The new rollback snapshot itself is active, but the old ones are rolled back
    for (const snap of result.toUndo) {
      const found = snapsAfter.find((s) => s.number === snap.number);
      expect(found.status).toBe('rolled-back');
    }
  });
});
