const path = require('path');
const { createTempProject, sleep } = require('../../helpers/temp-project');
const { ChangeBuffer } = require('../../../src/watcher/change-buffer');

describe('ChangeBuffer', () => {
  let project;
  let buffer;

  beforeEach(() => {
    project = createTempProject({
      'src/app.js': 'console.log("hello");',
      'src/utils.js': 'module.exports = {};',
    });
  });

  afterEach(() => {
    if (buffer) buffer.clear();
    if (project) project.cleanup();
  });

  test('buffer single change', () => {
    buffer = new ChangeBuffer(project.dir, { debounceMs: 60000 });
    buffer.add('modified', path.join(project.dir, 'src/app.js'));

    expect(buffer.changes.size).toBe(1);
    const entry = buffer.changes.get('src/app.js');
    expect(entry).toBeDefined();
    expect(entry.type).toBe('modified');
    expect(entry.filePath).toBe('src/app.js');
  });

  test('buffer deduplicates same file', () => {
    buffer = new ChangeBuffer(project.dir, { debounceMs: 60000 });
    buffer.add('modified', path.join(project.dir, 'src/app.js'));
    buffer.add('modified', path.join(project.dir, 'src/app.js'));
    buffer.add('modified', path.join(project.dir, 'src/app.js'));

    expect(buffer.changes.size).toBe(1);
  });

  test('buffer classifies add', () => {
    buffer = new ChangeBuffer(project.dir, { debounceMs: 60000 });
    buffer.add('added', path.join(project.dir, 'src/new-file.js'));

    const entry = buffer.changes.get('src/new-file.js');
    expect(entry).toBeDefined();
    expect(entry.type).toBe('added');
  });

  test('buffer classifies modify', () => {
    buffer = new ChangeBuffer(project.dir, { debounceMs: 60000 });
    buffer.add('modified', path.join(project.dir, 'src/app.js'));

    const entry = buffer.changes.get('src/app.js');
    expect(entry).toBeDefined();
    expect(entry.type).toBe('modified');
  });

  test('buffer classifies delete', () => {
    buffer = new ChangeBuffer(project.dir, { debounceMs: 60000 });
    buffer.add('deleted', path.join(project.dir, 'src/app.js'));

    const entry = buffer.changes.get('src/app.js');
    expect(entry).toBeDefined();
    expect(entry.type).toBe('deleted');
  });

  test('buffer multiple files', () => {
    buffer = new ChangeBuffer(project.dir, { debounceMs: 60000 });
    buffer.add('modified', path.join(project.dir, 'src/app.js'));
    buffer.add('added', path.join(project.dir, 'src/new.js'));
    buffer.add('deleted', path.join(project.dir, 'src/old.js'));

    expect(buffer.changes.size).toBe(3);
    expect(buffer.changes.get('src/app.js').type).toBe('modified');
    expect(buffer.changes.get('src/new.js').type).toBe('added');
    expect(buffer.changes.get('src/old.js').type).toBe('deleted');
  });

  test('flush clears buffer', async () => {
    buffer = new ChangeBuffer(project.dir, { debounceMs: 60000 });
    buffer.add('modified', path.join(project.dir, 'src/app.js'));

    expect(buffer.changes.size).toBe(1);

    await buffer.flush();

    expect(buffer.changes.size).toBe(0);
    expect(buffer.timer).toBeNull();
  });

  test('debounce timing', async () => {
    const debounceMs = 200;
    buffer = new ChangeBuffer(project.dir, { debounceMs });

    buffer.add('modified', path.join(project.dir, 'src/app.js'));
    expect(buffer.timer).not.toBeNull();

    // Before debounce fires, buffer should still have changes
    await sleep(50);
    expect(buffer.changes.size).toBe(1);

    // Add another change which resets the timer
    buffer.add('modified', path.join(project.dir, 'src/utils.js'));
    expect(buffer.changes.size).toBe(2);

    // Wait less than debounce
    await sleep(100);
    expect(buffer.changes.size).toBe(2);

    // Wait for debounce to fire
    await sleep(200);
    expect(buffer.changes.size).toBe(0);
  });

  test('file added then deleted in same window: no net change', () => {
    buffer = new ChangeBuffer(project.dir, { debounceMs: 60000 });
    buffer.add('added', path.join(project.dir, 'src/temp.js'));
    expect(buffer.changes.size).toBe(1);

    buffer.add('deleted', path.join(project.dir, 'src/temp.js'));
    expect(buffer.changes.size).toBe(0);
  });

  test('file modified then deleted: classified as deleted', () => {
    buffer = new ChangeBuffer(project.dir, { debounceMs: 60000 });
    buffer.add('modified', path.join(project.dir, 'src/app.js'));
    expect(buffer.changes.get('src/app.js').type).toBe('modified');

    buffer.add('deleted', path.join(project.dir, 'src/app.js'));
    expect(buffer.changes.size).toBe(1);
    expect(buffer.changes.get('src/app.js').type).toBe('deleted');
  });
});
