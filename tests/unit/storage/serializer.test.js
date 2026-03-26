const fs = require('fs');
const path = require('path');
const { createTempProject } = require('../../helpers/temp-project');
const store = require('../../../src/storage/store');
const serializer = require('../../../src/storage/serializer');

describe('serializer', () => {
  let project;

  beforeEach(() => {
    project = createTempProject({ 'index.js': 'console.log("hello");' });
    store.init(project.dir);
  });

  afterEach(() => {
    project.cleanup();
  });

  test('save and load snapshot: write meta + diffs, read back, verify identical', () => {
    const meta = { id: 'snap1', timestamp: 1700000000, label: 'first' };
    const diffs = { 'index.js': '--- a/index.js\n+++ b/index.js\n@@ -1 +1 @@\n-old\n+new' };
    const addedFiles = { 'newfile.txt': 'new file content' };

    serializer.saveSnapshot(project.dir, '1700000000-snap1', meta, diffs, addedFiles);
    const loaded = serializer.loadSnapshot(project.dir, '1700000000-snap1');

    expect(loaded).not.toBeNull();
    expect(loaded.meta).toEqual(meta);
    expect(loaded.diffs).toEqual(diffs);
    expect(loaded.addedFiles).toEqual(addedFiles);
  });

  test('save snapshot with 0 diffs: empty snapshot', () => {
    const meta = { id: 'empty', timestamp: 1700000000, label: 'empty snapshot' };

    serializer.saveSnapshot(project.dir, '1700000000-empty', meta, {}, {});
    const loaded = serializer.loadSnapshot(project.dir, '1700000000-empty');

    expect(loaded).not.toBeNull();
    expect(loaded.meta).toEqual(meta);
    expect(Object.keys(loaded.diffs)).toHaveLength(0);
    expect(Object.keys(loaded.addedFiles)).toHaveLength(0);
  });

  test('save snapshot with 20 diffs: all 20 diffs saved and loadable', () => {
    const meta = { id: 'big', timestamp: 1700000000, label: 'many diffs' };
    const diffs = {};
    for (let i = 0; i < 20; i++) {
      diffs[`file${i}.js`] = `diff content for file ${i}`;
    }

    serializer.saveSnapshot(project.dir, '1700000000-big', meta, diffs, {});
    const loaded = serializer.loadSnapshot(project.dir, '1700000000-big');

    expect(loaded).not.toBeNull();
    expect(Object.keys(loaded.diffs)).toHaveLength(20);
    for (let i = 0; i < 20; i++) {
      expect(loaded.diffs[`file${i}.js`]).toBe(`diff content for file ${i}`);
    }
  });

  test('save added file: full content stored in added/ directory', () => {
    const meta = { id: 'added', timestamp: 1700000000, label: 'with added' };
    const addedFiles = {
      'brand-new.js': 'export default function() { return 42; }',
      'another.txt': 'plain text content',
    };

    serializer.saveSnapshot(project.dir, '1700000000-added', meta, {}, addedFiles);

    // Verify files exist on disk in the added/ directory
    const snapshotPath = path.join(store.getSnapshotsPath(project.dir), '1700000000-added');
    expect(fs.existsSync(path.join(snapshotPath, 'added', 'brand-new.js'))).toBe(true);
    expect(fs.readFileSync(path.join(snapshotPath, 'added', 'brand-new.js'), 'utf-8'))
      .toBe('export default function() { return 42; }');

    // Verify loadSnapshot reads them back
    const loaded = serializer.loadSnapshot(project.dir, '1700000000-added');
    expect(loaded.addedFiles['brand-new.js']).toBe('export default function() { return 42; }');
    expect(loaded.addedFiles['another.txt']).toBe('plain text content');
  });

  test('load non-existent snapshot: returns null', () => {
    const result = serializer.loadSnapshot(project.dir, '9999999999-nonexistent');
    expect(result).toBeNull();
  });

  test('listSnapshots sorted by time: returns correct order', () => {
    const metas = [
      { id: 'a', timestamp: 1700000000, label: 'first' },
      { id: 'c', timestamp: 1700000002, label: 'third' },
      { id: 'b', timestamp: 1700000001, label: 'second' },
    ];

    serializer.saveSnapshot(project.dir, '1700000000-a', metas[0], {}, {});
    serializer.saveSnapshot(project.dir, '1700000002-c', metas[1], {}, {});
    serializer.saveSnapshot(project.dir, '1700000001-b', metas[2], {}, {});

    const list = serializer.listSnapshots(project.dir);

    expect(list).toHaveLength(3);
    // Directories sort lexicographically, so timestamps order them chronologically
    expect(list[0].id).toBe('a');
    expect(list[1].id).toBe('b');
    expect(list[2].id).toBe('c');
  });

  test('listSnapshots from empty store: returns empty array', () => {
    const list = serializer.listSnapshots(project.dir);
    expect(list).toEqual([]);
  });

  test('save snapshot with special characters in filepath: spaces, unicode, dots', () => {
    const meta = { id: 'special', timestamp: 1700000000, label: 'special chars' };
    const diffs = {
      'my file.js': 'diff for spaced file',
      'caf\u00e9.js': 'diff for unicode file',
      'some.config.json': 'diff for dotted file',
    };

    serializer.saveSnapshot(project.dir, '1700000000-special', meta, diffs, {});
    const loaded = serializer.loadSnapshot(project.dir, '1700000000-special');

    expect(loaded).not.toBeNull();
    expect(loaded.diffs['my file.js']).toBe('diff for spaced file');
    expect(loaded.diffs['caf\u00e9.js']).toBe('diff for unicode file');
    expect(loaded.diffs['some.config.json']).toBe('diff for dotted file');
  });

  test('save snapshot with nested directory paths: src/deep/nested/file.js stored correctly', () => {
    const meta = { id: 'nested', timestamp: 1700000000, label: 'nested paths' };
    const diffs = {
      'src/deep/nested/file.js': 'nested diff content',
      'lib/utils/helper.js': 'helper diff content',
    };
    const addedFiles = {
      'src/deep/nested/new.js': 'new nested file content',
    };

    serializer.saveSnapshot(project.dir, '1700000000-nested', meta, diffs, addedFiles);
    const loaded = serializer.loadSnapshot(project.dir, '1700000000-nested');

    expect(loaded).not.toBeNull();
    expect(loaded.diffs['src/deep/nested/file.js']).toBe('nested diff content');
    expect(loaded.diffs['lib/utils/helper.js']).toBe('helper diff content');
    expect(loaded.addedFiles['src/deep/nested/new.js']).toBe('new nested file content');
  });
});
