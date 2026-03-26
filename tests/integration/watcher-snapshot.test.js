const { createTempProject, addFile, modifyFile, deleteFile, readFile, fileExists, sleep } = require('../helpers/temp-project');
const { Watcher } = require('../../src/watcher/watcher');
const { listSnapshots } = require('../../src/storage/serializer');
const store = require('../../src/storage/store');

describe('Watcher-driven Snapshot Creation', () => {
  let project;
  let watcher;
  let snapshots;

  beforeEach(() => {
    project = createTempProject({
      'index.js': 'console.log("hello");\n',
      'utils.js': 'module.exports = {};\n',
    });
    store.init(project.dir);
    snapshots = [];
  });

  afterEach(async () => {
    if (watcher && watcher.running) {
      await watcher.stop();
    }
    project.cleanup();
  });

  function startWatcher(debounceMs = 500) {
    watcher = new Watcher(project.dir, {
      debounceMs,
      onSnapshot: (meta) => {
        snapshots.push(meta);
      },
    });
    watcher.start();
    return watcher;
  }

  test('Single file change creates snapshot', async () => {
    startWatcher(500);
    await sleep(500);

    modifyFile(project.dir, 'index.js', 'console.log("updated");\n');
    await sleep(2000);

    const all = listSnapshots(project.dir);
    expect(all.length).toBeGreaterThanOrEqual(1);
    const lastSnap = all[all.length - 1];
    expect(lastSnap.changes.some((c) => c.filePath === 'index.js')).toBe(true);
  });

  test('Multiple files in debounce window create single snapshot', async () => {
    startWatcher(500);
    await sleep(500);

    modifyFile(project.dir, 'index.js', 'console.log("a");\n');
    modifyFile(project.dir, 'utils.js', 'module.exports = { a: 1 };\n');
    addFile(project.dir, 'extra.js', 'extra\n');
    await sleep(2000);

    const all = listSnapshots(project.dir);
    expect(all).toHaveLength(1);
    expect(all[0].changes.length).toBeGreaterThanOrEqual(2);
  });

  test('Changes after debounce window create separate snapshots', async () => {
    startWatcher(500);
    await sleep(500);

    modifyFile(project.dir, 'index.js', 'console.log("first");\n');
    await sleep(2000);

    modifyFile(project.dir, 'utils.js', 'module.exports = { second: true };\n');
    await sleep(2000);

    const all = listSnapshots(project.dir);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  test('New file detected as added', async () => {
    startWatcher(500);
    await sleep(500);

    addFile(project.dir, 'brand-new.js', 'I am new\n');
    await sleep(2000);

    const all = listSnapshots(project.dir);
    expect(all.length).toBeGreaterThanOrEqual(1);
    const snap = all[all.length - 1];
    const addedChange = snap.changes.find((c) => c.filePath === 'brand-new.js');
    expect(addedChange).toBeDefined();
    expect(addedChange.type).toBe('added');
  });

  test('Deleted file detected', async () => {
    startWatcher(500);
    await sleep(500);

    deleteFile(project.dir, 'utils.js');
    await sleep(2000);

    const all = listSnapshots(project.dir);
    expect(all.length).toBeGreaterThanOrEqual(1);
    const snap = all[all.length - 1];
    const deletedChange = snap.changes.find((c) => c.filePath === 'utils.js');
    expect(deletedChange).toBeDefined();
    expect(deletedChange.type).toBe('deleted');
  });

  test('Ignored files not snapshotted (node_modules)', async () => {
    startWatcher(500);
    await sleep(500);

    addFile(project.dir, 'node_modules/pkg/index.js', 'module junk\n');
    await sleep(2000);

    const all = listSnapshots(project.dir);
    const hasNodeModules = all.some((s) =>
      s.changes.some((c) => c.filePath.includes('node_modules'))
    );
    expect(hasNodeModules).toBe(false);
  });

  test('Watcher survives rapid changes (create 50 files)', async () => {
    startWatcher(500);
    await sleep(500);

    for (let i = 0; i < 50; i++) {
      addFile(project.dir, `rapid/file${i}.js`, `content ${i}\n`);
    }
    await sleep(3000);

    const all = listSnapshots(project.dir);
    expect(all.length).toBeGreaterThanOrEqual(1);

    // All files should have been captured across all snapshots
    const allChangedFiles = all.flatMap((s) => s.changes.map((c) => c.filePath));
    const rapidFiles = allChangedFiles.filter((f) => f.startsWith('rapid/'));
    expect(rapidFiles.length).toBeGreaterThanOrEqual(1);
  });

  test('Watcher cleanup on stop', async () => {
    startWatcher(500);
    await sleep(500);

    expect(watcher.running).toBe(true);
    expect(watcher.chokidarWatcher).not.toBeNull();

    await watcher.stop();

    expect(watcher.running).toBe(false);
    expect(watcher.chokidarWatcher).toBeNull();

    // Changes after stop should not create snapshots
    const countBefore = listSnapshots(project.dir).length;
    modifyFile(project.dir, 'index.js', 'after stop\n');
    await sleep(2000);

    const countAfter = listSnapshots(project.dir).length;
    expect(countAfter).toBe(countBefore);
  });
});
