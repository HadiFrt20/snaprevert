const fs = require('fs');
const path = require('path');
const { createTempProject, addFile, fileExists, readFile } = require('../../helpers/temp-project');
const store = require('../../../src/storage/store');
const { saveSnapshot, listSnapshots } = require('../../../src/storage/serializer');
const { computeDiff } = require('../../../src/storage/differ');
const { rollback } = require('../../../src/engine/rollback');

describe('selective rollback (--only)', () => {
  let project;

  beforeEach(() => {
    project = createTempProject({ 'index.js': 'console.log("hello");' });
    store.init(project.dir);
  });

  afterEach(() => {
    project.cleanup();
  });

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

  function createMultiFileAddedSnapshot(number, files, timestamp) {
    const ts = timestamp || Date.now() + number;
    const name = `${ts}-snap${number}`;
    const changes = [];
    const addedFiles = {};
    for (const [filePath, content] of Object.entries(files)) {
      addFile(project.dir, filePath, content);
      changes.push({ filePath, type: 'added' });
      addedFiles[filePath] = content;
    }
    const meta = {
      timestamp: ts,
      id: `snap${number}`,
      name,
      number,
      label: `snapshot #${number}`,
      status: 'active',
      type: 'snapshot',
      changes,
      totalSize: 100,
    };
    saveSnapshot(project.dir, name, meta, {}, addedFiles);
    return name;
  }



  test('rollback with --only reverts only specified files', () => {
    createBareSnapshot(1, 1000000001);
    createMultiFileAddedSnapshot(2, {
      'src/auth.js': 'auth code',
      'src/db.js': 'db code',
      'src/api.js': 'api code',
    }, 1000000002);

    const result = rollback(project.dir, 1, { only: ['src/auth.js'] });

    expect(result.filesRemoved).toBe(1);
    expect(fileExists(project.dir, 'src/auth.js')).toBe(false);
    // The other files should still exist
    expect(fileExists(project.dir, 'src/db.js')).toBe(true);
    expect(fileExists(project.dir, 'src/api.js')).toBe(true);
  });

  test('rollback with --only leaves non-specified files unchanged', () => {
    createBareSnapshot(1, 1000000001);
    const oldContent = 'original line1\noriginal line2';
    const newContent = 'changed line1\nchanged line2';
    addFile(project.dir, 'keep.js', oldContent);
    addFile(project.dir, 'revert.js', oldContent);

    // Snapshot 2 modifies both files
    const ts = 1000000002;
    const name = `${ts}-snap2`;
    const diffKeep = computeDiff(oldContent, newContent);
    const diffRevert = computeDiff(oldContent, newContent);
    fs.writeFileSync(path.join(project.dir, 'keep.js'), newContent, 'utf-8');
    fs.writeFileSync(path.join(project.dir, 'revert.js'), newContent, 'utf-8');
    const meta = {
      timestamp: ts,
      id: 'snap2',
      name,
      number: 2,
      label: 'snapshot #2',
      status: 'active',
      type: 'snapshot',
      changes: [
        { filePath: 'keep.js', type: 'modified' },
        { filePath: 'revert.js', type: 'modified' },
      ],
      totalSize: 100,
    };
    saveSnapshot(project.dir, name, meta, {
      'keep.js': diffKeep,
      'revert.js': diffRevert,
    }, {});

    // Only rollback revert.js
    rollback(project.dir, 1, { only: ['revert.js'] });

    // keep.js should still have the new content
    expect(readFile(project.dir, 'keep.js')).toBe(newContent);
    // revert.js should be restored to old content
    expect(readFile(project.dir, 'revert.js')).toBe(oldContent);
  });

  test('rollback with --only using glob prefix match', () => {
    createBareSnapshot(1, 1000000001);
    createMultiFileAddedSnapshot(2, {
      'src/auth.js': 'auth code',
      'src/auth/middleware.js': 'middleware code',
      'src/db.js': 'db code',
    }, 1000000002);

    // Using prefix "src/auth" should match both "src/auth.js" and "src/auth/middleware.js"
    const result = rollback(project.dir, 1, { only: ['src/auth'] });

    expect(result.filesRemoved).toBe(2);
    expect(fileExists(project.dir, 'src/auth.js')).toBe(false);
    expect(fileExists(project.dir, 'src/auth/middleware.js')).toBe(false);
    // db.js should remain
    expect(fileExists(project.dir, 'src/db.js')).toBe(true);
  });

  test('rollback with --only on non-existent file path: no error, just skips', () => {
    createBareSnapshot(1, 1000000001);
    createAddedSnapshot(2, 'real.js', 'real content', 1000000002);

    // Specifying a path that does not match any change in the snapshot
    const result = rollback(project.dir, 1, { only: ['nonexistent.js'] });

    // No files should be affected since the pattern does not match
    expect(result.filesRemoved).toBe(0);
    expect(result.filesModified).toBe(0);
    expect(result.filesRestored).toBe(0);
    // The real file should still exist
    expect(fileExists(project.dir, 'real.js')).toBe(true);
  });

  test('partial rollback sets partialRollback flag in meta', () => {
    createBareSnapshot(1, 1000000001);
    createAddedSnapshot(2, 'file.js', 'content', 1000000002);

    const result = rollback(project.dir, 1, { only: ['file.js'] });

    expect(result.partialRollback).toBe(true);

    // Check the rollback snapshot meta on disk
    const snapshots = listSnapshots(project.dir);
    const rollbackSnap = snapshots.find((s) => s.type === 'rollback');
    expect(rollbackSnap).toBeDefined();
    expect(rollbackSnap.partialRollback).toBe(true);
    expect(rollbackSnap.onlyFiles).toEqual(['file.js']);
    expect(rollbackSnap.label).toContain('partial rollback');
    expect(rollbackSnap.label).toContain('file.js');
  });

  test('multiple --only files: all specified files reverted', () => {
    createBareSnapshot(1, 1000000001);
    createMultiFileAddedSnapshot(2, {
      'a.js': 'aaa',
      'b.js': 'bbb',
      'c.js': 'ccc',
      'd.js': 'ddd',
    }, 1000000002);

    const result = rollback(project.dir, 1, { only: ['a.js', 'c.js'] });

    expect(result.filesRemoved).toBe(2);
    expect(fileExists(project.dir, 'a.js')).toBe(false);
    expect(fileExists(project.dir, 'c.js')).toBe(false);
    // b.js and d.js should remain
    expect(fileExists(project.dir, 'b.js')).toBe(true);
    expect(fileExists(project.dir, 'd.js')).toBe(true);
  });
});
