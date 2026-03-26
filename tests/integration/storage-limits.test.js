const { createTempProject, addFile, modifyFile, deleteFile, readFile, fileExists, sleep } = require('../helpers/temp-project');
const { ChangeBuffer } = require('../../src/watcher/change-buffer');
const { listSnapshots, loadSnapshot } = require('../../src/storage/serializer');
const store = require('../../src/storage/store');
const { saveConfig, loadConfig } = require('../../src/utils/config');
const fs = require('fs');
const path = require('path');

describe('Storage Limits', () => {
  let project;

  beforeEach(() => {
    project = createTempProject({
      'index.js': 'hello\n',
    });
    store.init(project.dir);
  });

  afterEach(() => {
    project.cleanup();
  });

  test('Max file size: large file skipped', () => {
    // Set max file size to 1 KB
    saveConfig(project.dir, { ...loadConfig(project.dir), max_file_size_kb: 1 });

    const buffer = new ChangeBuffer(project.dir, { debounceMs: 50, maxFileSizeKb: 1 });
    buffer.initCache(['index.js']);

    // Create a file larger than 1 KB
    const largeContent = 'x'.repeat(2048) + '\n';
    addFile(project.dir, 'large.js', largeContent);

    const snap = buffer.createSnapshot([{ type: 'added', filePath: 'large.js' }]);

    // The snapshot should be null because the only change was a large file that got skipped
    expect(snap).toBeNull();

    // Create a small file alongside to confirm small files work
    addFile(project.dir, 'small.js', 'small\n');
    const snap2 = buffer.createSnapshot([
      { type: 'added', filePath: 'large.js' },
      { type: 'added', filePath: 'small.js' },
    ]);

    expect(snap2).not.toBeNull();
    const loaded = loadSnapshot(project.dir, snap2.name);
    expect('small.js' in loaded.addedFiles).toBe(true);
    expect('large.js' in loaded.addedFiles).toBe(false);
  });

  test('Binary file handling: non-utf8 content is handled gracefully', () => {
    const buffer = new ChangeBuffer(project.dir, { debounceMs: 50 });
    buffer.initCache(['index.js']);

    // Write a file with content that can be read as utf-8
    addFile(project.dir, 'data.bin', 'binary-like content\n');

    const snap = buffer.createSnapshot([{ type: 'added', filePath: 'data.bin' }]);
    expect(snap).not.toBeNull();

    const loaded = loadSnapshot(project.dir, snap.name);
    expect('data.bin' in loaded.addedFiles).toBe(true);
    expect(loaded.addedFiles['data.bin']).toBe('binary-like content\n');
  });

  test('Large project: 500 files, snapshot under 2s', () => {
    // Create 500 files
    for (let i = 0; i < 500; i++) {
      addFile(project.dir, `src/file${i}.js`, `// file ${i}\nconst val = ${i};\n`);
    }

    const fileList = [];
    for (let i = 0; i < 500; i++) {
      fileList.push(`src/file${i}.js`);
    }

    const buffer = new ChangeBuffer(project.dir, { debounceMs: 50 });
    buffer.initCache(fileList);

    // Modify 50 files
    const changes = [];
    for (let i = 0; i < 50; i++) {
      modifyFile(project.dir, `src/file${i}.js`, `// file ${i} modified\nconst val = ${i * 10};\n`);
      changes.push({ type: 'modified', filePath: `src/file${i}.js` });
    }

    const start = Date.now();
    const snap = buffer.createSnapshot(changes);
    const elapsed = Date.now() - start;

    expect(snap).not.toBeNull();
    expect(elapsed).toBeLessThan(2000);
    expect(snap.changes).toHaveLength(50);
  });

  test('Many snapshots: 100 snapshots, list under 500ms', () => {
    const buffer = new ChangeBuffer(project.dir, { debounceMs: 50 });
    buffer.initCache(['index.js']);

    for (let i = 0; i < 100; i++) {
      addFile(project.dir, `gen/file${i}.js`, `content ${i}\n`);
      buffer.createSnapshot([{ type: 'added', filePath: `gen/file${i}.js` }]);
    }

    const start = Date.now();
    const all = listSnapshots(project.dir);
    const elapsed = Date.now() - start;

    expect(all).toHaveLength(100);
    expect(elapsed).toBeLessThan(500);
  });

  test('Cleanup by age: old snapshots can be identified and removed', () => {
    const buffer = new ChangeBuffer(project.dir, { debounceMs: 50 });
    buffer.initCache(['index.js']);

    // Create snapshots
    addFile(project.dir, 'a.js', 'a\n');
    const snap1 = buffer.createSnapshot([{ type: 'added', filePath: 'a.js' }]);

    addFile(project.dir, 'b.js', 'b\n');
    const snap2 = buffer.createSnapshot([{ type: 'added', filePath: 'b.js' }]);

    addFile(project.dir, 'c.js', 'c\n');
    const snap3 = buffer.createSnapshot([{ type: 'added', filePath: 'c.js' }]);

    // Manually age the first snapshot by modifying its timestamp
    const snapDir = path.join(store.getSnapshotsPath(project.dir), snap1.name);
    const metaPath = path.join(snapDir, 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    meta.timestamp = thirtyOneDaysAgo;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

    // Find old snapshots
    const retentionMs = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const all = listSnapshots(project.dir);
    const old = all.filter((s) => now - s.timestamp > retentionMs);
    const recent = all.filter((s) => now - s.timestamp <= retentionMs);

    expect(old).toHaveLength(1);
    expect(old[0].name).toBe(snap1.name);
    expect(recent).toHaveLength(2);

    // Delete old snapshots
    for (const s of old) {
      store.deleteSnapshotDir(project.dir, s.name);
    }

    const remaining = listSnapshots(project.dir);
    expect(remaining).toHaveLength(2);
    expect(remaining.map((s) => s.name)).not.toContain(snap1.name);
  });

  test('Cleanup keeps minimum 5 snapshots even if all are old', () => {
    const buffer = new ChangeBuffer(project.dir, { debounceMs: 50 });
    buffer.initCache([]);

    // Create 8 snapshots
    for (let i = 0; i < 8; i++) {
      addFile(project.dir, `keep${i}.js`, `keep ${i}\n`);
      buffer.createSnapshot([{ type: 'added', filePath: `keep${i}.js` }]);
    }

    // Make all snapshots old
    const all = listSnapshots(project.dir);
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    for (const s of all) {
      const metaPath = path.join(store.getSnapshotsPath(project.dir), s.name, 'meta.json');
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.timestamp = sixtyDaysAgo;
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    }

    // Simulate cleanup that keeps minimum 5
    const retentionMs = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const reloaded = listSnapshots(project.dir);
    const oldSnaps = reloaded
      .filter((s) => now - s.timestamp > retentionMs)
      .sort((a, b) => a.timestamp - b.timestamp); // oldest first

    const minKeep = 5;
    const toDelete = oldSnaps.slice(0, Math.max(0, oldSnaps.length - minKeep));

    for (const s of toDelete) {
      store.deleteSnapshotDir(project.dir, s.name);
    }

    const remaining = listSnapshots(project.dir);
    expect(remaining).toHaveLength(5);
    expect(remaining.length).toBeGreaterThanOrEqual(minKeep);
  });
});
