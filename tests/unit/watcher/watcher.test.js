const fs = require('fs');
const path = require('path');
const { createTempProject, sleep, addFile, modifyFile, deleteFile } = require('../../helpers/temp-project');
const { Watcher } = require('../../../src/watcher/watcher');

describe('Watcher', () => {
  let project;
  let watcher;

  beforeEach(() => {
    project = createTempProject({
      'src/app.js': 'console.log("hello");',
      'src/utils.js': 'module.exports = {};',
    });
  });

  afterEach(async () => {
    if (watcher && watcher.running) {
      await watcher.stop();
    }
    if (project) project.cleanup();
  });

  test('starts watching: no errors on start', () => {
    watcher = new Watcher(project.dir, { debounceMs: 60000 });
    const result = watcher.start();

    expect(result).toBe(watcher);
    expect(watcher.running).toBe(true);
    expect(watcher.chokidarWatcher).not.toBeNull();
    expect(watcher.shouldWatch).toBeInstanceOf(Function);
    expect(watcher.changeBuffer).not.toBeNull();
  });

  test('stops cleanly', async () => {
    watcher = new Watcher(project.dir, { debounceMs: 60000 });
    watcher.start();
    expect(watcher.running).toBe(true);

    await watcher.stop();

    expect(watcher.running).toBe(false);
    expect(watcher.chokidarWatcher).toBeNull();
  });

  test('detects file creation', async () => {
    watcher = new Watcher(project.dir, { debounceMs: 60000 });
    watcher.start();

    // Wait for chokidar to be ready
    await sleep(500);

    addFile(project.dir, 'src/new-file.js', 'const x = 1;');

    // Wait for chokidar to detect the change
    await sleep(1000);

    expect(watcher.changeBuffer.changes.size).toBeGreaterThanOrEqual(1);
    const entry = watcher.changeBuffer.changes.get('src/new-file.js');
    expect(entry).toBeDefined();
    expect(entry.type).toBe('added');
  });

  test('detects file modification', async () => {
    watcher = new Watcher(project.dir, { debounceMs: 60000 });
    watcher.start();

    await sleep(500);

    modifyFile(project.dir, 'src/app.js', 'console.log("updated");');

    await sleep(1000);

    expect(watcher.changeBuffer.changes.size).toBeGreaterThanOrEqual(1);
    const entry = watcher.changeBuffer.changes.get('src/app.js');
    expect(entry).toBeDefined();
    expect(entry.type).toBe('modified');
  });

  test('detects file deletion', async () => {
    watcher = new Watcher(project.dir, { debounceMs: 60000 });
    watcher.start();

    await sleep(500);

    deleteFile(project.dir, 'src/utils.js');

    await sleep(1000);

    expect(watcher.changeBuffer.changes.size).toBeGreaterThanOrEqual(1);
    const entry = watcher.changeBuffer.changes.get('src/utils.js');
    expect(entry).toBeDefined();
    expect(entry.type).toBe('deleted');
  });

  test('ignores .snaprevert/ changes', async () => {
    watcher = new Watcher(project.dir, { debounceMs: 60000 });
    watcher.start();

    await sleep(500);

    // Create a file inside .snaprevert/
    addFile(project.dir, '.snaprevert/state.json', '{"current": null}');

    await sleep(1000);

    const entry = watcher.changeBuffer.changes.get('.snaprevert/state.json');
    expect(entry).toBeUndefined();
  });

  test('ignores node_modules/', async () => {
    watcher = new Watcher(project.dir, { debounceMs: 60000 });
    watcher.start();

    await sleep(500);

    addFile(project.dir, 'node_modules/pkg/index.js', 'module.exports = {};');

    await sleep(1000);

    const entry = watcher.changeBuffer.changes.get('node_modules/pkg/index.js');
    expect(entry).toBeUndefined();
  });

  test('respects custom ignore patterns', async () => {
    // Create project with .snaprevertignore
    project.cleanup();
    project = createTempProject({
      'src/app.js': 'hello',
      '.snaprevertignore': '*.log',
    });

    watcher = new Watcher(project.dir, { debounceMs: 60000 });
    watcher.start();

    await sleep(500);

    addFile(project.dir, 'error.log', 'some error');
    addFile(project.dir, 'src/new.js', 'const y = 2;');

    await sleep(1000);

    // .log file should be ignored
    const logEntry = watcher.changeBuffer.changes.get('error.log');
    expect(logEntry).toBeUndefined();

    // .js file should be detected
    const jsEntry = watcher.changeBuffer.changes.get('src/new.js');
    expect(jsEntry).toBeDefined();
    expect(jsEntry.type).toBe('added');
  });

  test('handles rapid changes: 100 files changed quickly', async () => {
    watcher = new Watcher(project.dir, { debounceMs: 60000 });
    watcher.start();

    await sleep(500);

    // Rapidly create 100 files
    for (let i = 0; i < 100; i++) {
      addFile(project.dir, `src/rapid-${i}.js`, `const x = ${i};`);
    }

    // Give chokidar enough time to detect all changes
    await sleep(3000);

    // The buffer should have captured a significant number of the changes
    // (chokidar may batch some, but we should see most of them)
    expect(watcher.changeBuffer.changes.size).toBeGreaterThanOrEqual(50);

    // Verify they are all classified as added
    for (const [, entry] of watcher.changeBuffer.changes) {
      expect(entry.type).toBe('added');
    }
  });
});
