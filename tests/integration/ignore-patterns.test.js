const { createTempProject, addFile, sleep } = require('../helpers/temp-project');
const { buildIgnoreFilter } = require('../../src/watcher/ignore');
const { Watcher } = require('../../src/watcher/watcher');
const { listSnapshots } = require('../../src/storage/serializer');
const store = require('../../src/storage/store');
const path = require('path');

describe('Ignore Patterns', () => {
  let project;
  let watcher;

  afterEach(async () => {
    if (watcher && watcher.running) {
      await watcher.stop();
    }
    if (project) {
      project.cleanup();
    }
  });

  test('Default ignores work', () => {
    project = createTempProject({
      'src/index.js': 'hello\n',
    });

    const filter = buildIgnoreFilter(project.dir, []);

    // These should be ignored
    expect(filter(path.join(project.dir, 'node_modules', 'pkg', 'index.js'))).toBe(false);
    expect(filter(path.join(project.dir, '.git', 'HEAD'))).toBe(false);
    expect(filter(path.join(project.dir, '.snaprevert', 'config.json'))).toBe(false);
    expect(filter(path.join(project.dir, '__pycache__', 'mod.pyc'))).toBe(false);
    expect(filter(path.join(project.dir, '.DS_Store'))).toBe(false);
    expect(filter(path.join(project.dir, 'dist', 'bundle.js'))).toBe(false);
    expect(filter(path.join(project.dir, '.env'))).toBe(false);
    expect(filter(path.join(project.dir, 'coverage', 'lcov.info'))).toBe(false);

    // These should be watched
    expect(filter(path.join(project.dir, 'src', 'index.js'))).toBe(true);
    expect(filter(path.join(project.dir, 'package.json'))).toBe(true);
  });

  test('.gitignore respected', async () => {
    project = createTempProject({
      'src/index.js': 'hello\n',
      '.gitignore': 'logs/\n*.log\nsecrets.json\n',
    });
    store.init(project.dir);

    const filter = buildIgnoreFilter(project.dir, []);

    // Patterns from .gitignore should be ignored
    expect(filter(path.join(project.dir, 'logs', 'app.txt'))).toBe(false);
    expect(filter(path.join(project.dir, 'debug.log'))).toBe(false);
    expect(filter(path.join(project.dir, 'secrets.json'))).toBe(false);

    // Normal files still watched
    expect(filter(path.join(project.dir, 'src', 'index.js'))).toBe(true);

    // Verify with actual watcher
    const snapshots = [];
    watcher = new Watcher(project.dir, {
      debounceMs: 500,
      onSnapshot: (meta) => snapshots.push(meta),
    });
    watcher.start();
    await sleep(500);

    addFile(project.dir, 'logs/app.txt', 'log data\n');
    addFile(project.dir, 'error.log', 'error\n');
    await sleep(2000);

    const all = listSnapshots(project.dir);
    const logChanges = all.flatMap((s) => s.changes).filter(
      (c) => c.filePath.includes('logs/') || c.filePath.endsWith('.log')
    );
    expect(logChanges).toHaveLength(0);
  });

  test('.snaprevertignore added on top of .gitignore', () => {
    project = createTempProject({
      'src/index.js': 'hello\n',
      '.gitignore': '*.log\n',
      '.snaprevertignore': 'temp/\n*.bak\n',
    });

    const filter = buildIgnoreFilter(project.dir, []);

    // From .gitignore
    expect(filter(path.join(project.dir, 'error.log'))).toBe(false);

    // From .snaprevertignore
    expect(filter(path.join(project.dir, 'temp', 'data.txt'))).toBe(false);
    expect(filter(path.join(project.dir, 'file.bak'))).toBe(false);

    // Normal files still watched
    expect(filter(path.join(project.dir, 'src', 'index.js'))).toBe(true);
  });

  test('Pattern changes at runtime via extra patterns from config', () => {
    project = createTempProject({
      'src/index.js': 'hello\n',
    });

    // First filter: no extra patterns
    const filter1 = buildIgnoreFilter(project.dir, []);
    expect(filter1(path.join(project.dir, 'vendor', 'lib.js'))).toBe(true);

    // Second filter: add vendor/ to ignore
    const filter2 = buildIgnoreFilter(project.dir, ['vendor']);
    expect(filter2(path.join(project.dir, 'vendor', 'lib.js'))).toBe(false);

    // Normal files unaffected
    expect(filter2(path.join(project.dir, 'src', 'index.js'))).toBe(true);

    // Third filter: different extra patterns
    const filter3 = buildIgnoreFilter(project.dir, ['*.tmp', 'cache']);
    expect(filter3(path.join(project.dir, 'data.tmp'))).toBe(false);
    expect(filter3(path.join(project.dir, 'cache', 'item.js'))).toBe(false);
    expect(filter3(path.join(project.dir, 'vendor', 'lib.js'))).toBe(true); // no longer ignored
  });

  test('Nested .gitignore patterns with paths', () => {
    project = createTempProject({
      'src/index.js': 'hello\n',
      '.gitignore': 'src/generated/**\nbuild/output\n*.min.js\n',
    });

    const filter = buildIgnoreFilter(project.dir, []);

    // Path-based patterns
    expect(filter(path.join(project.dir, 'src', 'generated', 'types.ts'))).toBe(false);
    expect(filter(path.join(project.dir, 'src', 'generated', 'deep', 'file.ts'))).toBe(false);
    expect(filter(path.join(project.dir, 'build', 'output'))).toBe(false);

    // Wildcard patterns
    expect(filter(path.join(project.dir, 'bundle.min.js'))).toBe(false);
    expect(filter(path.join(project.dir, 'lib', 'vendor.min.js'))).toBe(false);

    // Non-matching files pass through
    expect(filter(path.join(project.dir, 'src', 'index.js'))).toBe(true);
    expect(filter(path.join(project.dir, 'src', 'manual', 'types.ts'))).toBe(true);
  });
});
