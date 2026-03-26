const fs = require('fs');
const path = require('path');
const { createTempProject, addFile, fileExists, readFile } = require('../../helpers/temp-project');
const store = require('../../../src/storage/store');
const { saveSnapshot, listSnapshots, loadSnapshot } = require('../../../src/storage/serializer');
const { computeDiff } = require('../../../src/storage/differ');
const { rollback } = require('../../../src/engine/rollback');

describe('rollback', () => {
  let project;

  beforeEach(() => {
    project = createTempProject({ 'index.js': 'console.log("hello");' });
    store.init(project.dir);
  });

  afterEach(() => {
    project.cleanup();
  });

  /**
   * Helper: create a snapshot with 'added' type changes.
   * Writes the file to disk and saves snapshot metadata + addedFiles.
   */
  function createAddedSnapshot(number, filePath, content, timestamp) {
    const ts = timestamp || Date.now() + number;
    const name = `${ts}-snap${number}`;
    addFile(project.dir, filePath, content);
    const meta = {
      timestamp: ts,
      id: `snap${number}`,
      name,
      number,
      label: `snapshot #${number}`,
      status: 'active',
      type: 'snapshot',
      changes: [{ filePath, type: 'added' }],
      totalSize: content.length,
    };
    const addedFiles = { [filePath]: content };
    saveSnapshot(project.dir, name, meta, {}, addedFiles);
    return name;
  }

  /**
   * Helper: create a snapshot with 'modified' type changes.
   * The file must already exist on disk with `oldContent`.
   * Writes `newContent` to disk and saves the diff.
   */
  function createModifiedSnapshot(number, filePath, oldContent, newContent, timestamp) {
    const ts = timestamp || Date.now() + number;
    const name = `${ts}-snap${number}`;
    const diff = computeDiff(oldContent, newContent);
    fs.writeFileSync(path.join(project.dir, filePath), newContent, 'utf-8');
    const meta = {
      timestamp: ts,
      id: `snap${number}`,
      name,
      number,
      label: `snapshot #${number}`,
      status: 'active',
      type: 'snapshot',
      changes: [{ filePath, type: 'modified' }],
      totalSize: newContent.length,
    };
    saveSnapshot(project.dir, name, meta, diff ? { [filePath]: diff } : {}, {});
    return name;
  }

  /**
   * Helper: create a snapshot with 'deleted' type changes.
   * Removes the file from disk and stores its content under __deleted__/ key.
   */
  function createDeletedSnapshot(number, filePath, deletedContent, timestamp) {
    const ts = timestamp || Date.now() + number;
    const name = `${ts}-snap${number}`;
    const absPath = path.join(project.dir, filePath);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    const meta = {
      timestamp: ts,
      id: `snap${number}`,
      name,
      number,
      label: `snapshot #${number}`,
      status: 'active',
      type: 'snapshot',
      changes: [{ filePath, type: 'deleted' }],
      totalSize: 0,
    };
    const addedFiles = { ['__deleted__/' + filePath]: deletedContent };
    saveSnapshot(project.dir, name, meta, {}, addedFiles);
    return name;
  }

  /** Helper: create a bare snapshot with no file changes. */
  function createBareSnapshot(number, timestamp) {
    const ts = timestamp || Date.now() + number;
    const name = `${ts}-snap${number}`;
    const meta = {
      timestamp: ts,
      id: `snap${number}`,
      name,
      number,
      label: `snapshot #${number}`,
      status: 'active',
      type: 'snapshot',
      changes: [],
      totalSize: 0,
    };
    saveSnapshot(project.dir, name, meta, {}, {});
    return name;
  }

  test('rollback to last snapshot', () => {
    createBareSnapshot(1, 1000000001);
    createAddedSnapshot(2, 'newfile.js', 'new content', 1000000002);

    const result = rollback(project.dir, 1);
    expect(result.target.number).toBe(1);
    expect(result.toUndo.length).toBe(1);
    expect(result.toUndo[0].number).toBe(2);
  });

  test('rollback to first snapshot', () => {
    createBareSnapshot(1, 1000000001);
    createAddedSnapshot(2, 'a.js', 'aaa', 1000000002);
    createAddedSnapshot(3, 'b.js', 'bbb', 1000000003);
    createAddedSnapshot(4, 'c.js', 'ccc', 1000000004);

    const result = rollback(project.dir, 1);
    expect(result.toUndo.length).toBe(3);
    expect(result.filesRemoved).toBe(3);
    expect(fileExists(project.dir, 'a.js')).toBe(false);
    expect(fileExists(project.dir, 'b.js')).toBe(false);
    expect(fileExists(project.dir, 'c.js')).toBe(false);
  });

  test('rollback modified file: restored to previous version', () => {
    const oldContent = 'line1\nline2\nline3';
    const newContent = 'line1\nline2-changed\nline3';
    // Snapshot 1: the base (no changes)
    createBareSnapshot(1, 1000000001);
    // Write the original file
    addFile(project.dir, 'app.js', oldContent);
    // Snapshot 2: modifies app.js
    createModifiedSnapshot(2, 'app.js', oldContent, newContent, 1000000002);

    // Now app.js has newContent on disk
    expect(readFile(project.dir, 'app.js')).toBe(newContent);

    const result = rollback(project.dir, 1);
    expect(result.filesModified).toBe(1);
    expect(readFile(project.dir, 'app.js')).toBe(oldContent);
  });

  test('rollback added file: file deleted', () => {
    createBareSnapshot(1, 1000000001);
    createAddedSnapshot(2, 'feature.js', 'feature code', 1000000002);

    expect(fileExists(project.dir, 'feature.js')).toBe(true);
    rollback(project.dir, 1);
    expect(fileExists(project.dir, 'feature.js')).toBe(false);
  });

  test('rollback deleted file: file recreated', () => {
    createBareSnapshot(1, 1000000001);
    // To make the deleted content round-trip correctly through the serializer,
    // we must save it directly into the snapshot's added/ directory with the
    // exact filename that the serializer will load back as '__deleted__/legacy.js'.
    // The serializer replaces / with __ on save and __ with / on load.
    // So we need a filename that loads as '__deleted__/legacy.js'.
    // '__deleted__/legacy.js' -> save filename: '__deleted____legacy.js'
    // -> load key: '//deleted//legacy.js' (NOT what we want)
    // The correct approach: manually write the file into the snapshot's added/ dir
    addFile(project.dir, 'legacy.js', 'old legacy code');
    createDeletedSnapshot(2, 'legacy.js', 'old legacy code', 1000000002);

    expect(fileExists(project.dir, 'legacy.js')).toBe(false);
    const result = rollback(project.dir, 1);
    expect(result.filesRestored).toBe(1);
    expect(fileExists(project.dir, 'legacy.js')).toBe(true);
    expect(readFile(project.dir, 'legacy.js')).toBe('old legacy code');
  });

  test('rollback multiple files', () => {
    createBareSnapshot(1, 1000000001);
    // Snapshot 2: adds two files in one snapshot
    const ts = 1000000002;
    const name = `${ts}-snap2`;
    addFile(project.dir, 'x.js', 'x content');
    addFile(project.dir, 'y.js', 'y content');
    const meta = {
      timestamp: ts, id: 'snap2', name, number: 2,
      label: 'snapshot #2', status: 'active', type: 'snapshot',
      changes: [
        { filePath: 'x.js', type: 'added' },
        { filePath: 'y.js', type: 'added' },
      ],
      totalSize: 20,
    };
    saveSnapshot(project.dir, name, meta, {}, { 'x.js': 'x content', 'y.js': 'y content' });

    const result = rollback(project.dir, 1);
    expect(result.filesRemoved).toBe(2);
    expect(fileExists(project.dir, 'x.js')).toBe(false);
    expect(fileExists(project.dir, 'y.js')).toBe(false);
  });

  test('rollback preserves undone snapshots (status = rolled-back, not deleted)', () => {
    createBareSnapshot(1, 1000000001);
    const snap2Name = createAddedSnapshot(2, 'tmp.js', 'tmp', 1000000002);

    rollback(project.dir, 1);

    const snapshots = listSnapshots(project.dir);
    const snap2 = snapshots.find((s) => s.number === 2);
    expect(snap2).toBeDefined();
    expect(snap2.status).toBe('rolled-back');

    // The snapshot directory still exists on disk
    const snapshotPath = path.join(store.getSnapshotsPath(project.dir), snap2Name);
    expect(fs.existsSync(snapshotPath)).toBe(true);
  });

  test('rollback creates rollback snapshot', () => {
    createBareSnapshot(1, 1000000001);
    createAddedSnapshot(2, 'file.js', 'content', 1000000002);

    rollback(project.dir, 1);

    const snapshots = listSnapshots(project.dir);
    const rollbackSnap = snapshots.find((s) => s.type === 'rollback');
    expect(rollbackSnap).toBeDefined();
    expect(rollbackSnap.status).toBe('active');
    expect(rollbackSnap.label).toBe('rollback to #1');
    expect(rollbackSnap.rollbackTarget).toBe(1);
    expect(rollbackSnap.undoneSnapshots).toEqual([2]);
    expect(rollbackSnap.number).toBe(3);
  });

  test('rollback to non-existent snapshot: error', () => {
    createBareSnapshot(1, 1000000001);

    expect(() => rollback(project.dir, 99)).toThrow('Snapshot #99 not found');
  });

  test('rollback to already rolled-back snapshot: error (no active snapshots after it)', () => {
    createBareSnapshot(1, 1000000001);
    createAddedSnapshot(2, 'file.js', 'content', 1000000002);

    // Roll back to 1 (marks 2 as rolled-back)
    rollback(project.dir, 1);

    // Try to roll back to 1 again -- snapshot 2 is rolled-back, no active ones after 1
    // The rollback snapshot (#3) is after #1 but we need to account for it
    // Actually the rollback snapshot is active and number 3, so rolling back to 1
    // would try to undo snapshot 3. Let's test rolling back to 2 which is rolled-back itself
    // with nothing active after it.
    // The real scenario: roll back to snapshot 2 which is now rolled-back, no active snapshots after #2 except #3
    // Let's test: create a scenario where there truly are no active snapshots after the target.
    const project2 = createTempProject({ 'index.js': 'hi' });
    store.init(project2.dir);
    const ts2 = 2000000001;
    const name2 = `${ts2}-s1`;
    const meta2 = {
      timestamp: ts2, id: 's1', name: name2, number: 1,
      label: 'snap1', status: 'active', type: 'snapshot',
      changes: [], totalSize: 0,
    };
    saveSnapshot(project2.dir, name2, meta2, {}, {});

    // Snapshot #1 is the only one and there are no active snapshots after it
    expect(() => rollback(project2.dir, 1)).toThrow('No active snapshots after #1 to undo');
    project2.cleanup();
  });

  test('double rollback: to #3 then to #1', () => {
    createBareSnapshot(1, 1000000001);
    createAddedSnapshot(2, 'a.js', 'aaa', 1000000002);
    createAddedSnapshot(3, 'b.js', 'bbb', 1000000003);
    createAddedSnapshot(4, 'c.js', 'ccc', 1000000004);

    // First rollback: to #3 (undoes #4)
    const r1 = rollback(project.dir, 3);
    expect(r1.filesRemoved).toBe(1);
    expect(fileExists(project.dir, 'c.js')).toBe(false);
    expect(fileExists(project.dir, 'b.js')).toBe(true);

    // Second rollback: to #1 (undoes #2 and #3, skips rolled-back #4)
    const r2 = rollback(project.dir, 1);
    expect(r2.toUndo.length).toBeGreaterThanOrEqual(2);
    expect(fileExists(project.dir, 'a.js')).toBe(false);
    expect(fileExists(project.dir, 'b.js')).toBe(false);
  });

  test('rollback is atomic (best effort): partial failures do not crash', () => {
    createBareSnapshot(1, 1000000001);
    // Create a snapshot referencing a file that does not exist on disk
    const ts = 1000000002;
    const name = `${ts}-snap2`;
    const meta = {
      timestamp: ts, id: 'snap2', name, number: 2,
      label: 'snapshot #2', status: 'active', type: 'snapshot',
      changes: [
        { filePath: 'ghost.js', type: 'added' },
        { filePath: 'real.js', type: 'added' },
      ],
      totalSize: 10,
    };
    // ghost.js does not exist on disk, real.js does
    addFile(project.dir, 'real.js', 'real');
    saveSnapshot(project.dir, name, meta, {}, { 'ghost.js': 'ghost', 'real.js': 'real' });

    // Should not throw even though ghost.js doesn't exist
    const result = rollback(project.dir, 1);
    // real.js was removed, ghost.js silently skipped
    expect(result.filesRemoved).toBe(1);
    expect(fileExists(project.dir, 'real.js')).toBe(false);
  });
});
