const fs = require('fs');
const path = require('path');
const { createTempProject } = require('../../helpers/temp-project');
const { buildIgnoreFilter, parseIgnoreFile, DEFAULT_IGNORES } = require('../../../src/watcher/ignore');

describe('ignore', () => {
  let project;

  afterEach(() => {
    if (project) project.cleanup();
  });

  test('default ignores: node_modules, .git, .snaprevert, __pycache__, .DS_Store always ignored', () => {
    project = createTempProject({ 'src/app.js': 'hello' });
    const shouldWatch = buildIgnoreFilter(project.dir);

    expect(shouldWatch(path.join(project.dir, 'node_modules/express/index.js'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, '.git/HEAD'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, '.snaprevert/config.json'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, '__pycache__/mod.cpython-39.pyc'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, '.DS_Store'))).toBe(false);
  });

  test('parse .gitignore: standard patterns (*.pyc, dist/, build/) respected', () => {
    project = createTempProject({
      'src/app.js': 'hello',
      '.gitignore': '*.pyc\ndist/\nbuild/',
    });
    const shouldWatch = buildIgnoreFilter(project.dir);

    expect(shouldWatch(path.join(project.dir, 'module.pyc'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, 'dist/bundle.js'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, 'build/output.js'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, 'src/app.js'))).toBe(true);
  });

  test('parse .snaprevertignore: additional patterns added on top of .gitignore', () => {
    project = createTempProject({
      'src/app.js': 'hello',
      '.gitignore': '*.log',
      '.snaprevertignore': '*.tmp\nsecrets/',
    });
    const shouldWatch = buildIgnoreFilter(project.dir);

    // .gitignore pattern
    expect(shouldWatch(path.join(project.dir, 'error.log'))).toBe(false);
    // .snaprevertignore patterns
    expect(shouldWatch(path.join(project.dir, 'cache.tmp'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, 'secrets/key.pem'))).toBe(false);
    // Normal file still watched
    expect(shouldWatch(path.join(project.dir, 'src/app.js'))).toBe(true);
  });

  test('negation patterns: !important.log overrides *.log ignore', () => {
    project = createTempProject({
      '.gitignore': '*.log\n!important.log',
    });
    const shouldWatch = buildIgnoreFilter(project.dir);

    expect(shouldWatch(path.join(project.dir, 'debug.log'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, 'important.log'))).toBe(true);
  });

  test('directory patterns: trailing / matches only directories', () => {
    project = createTempProject({
      '.gitignore': 'logs/',
    });
    const shouldWatch = buildIgnoreFilter(project.dir);

    expect(shouldWatch(path.join(project.dir, 'logs/app.log'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, 'src/app.js'))).toBe(true);
  });

  test('glob patterns: *.js, **/*.test.js work correctly', () => {
    project = createTempProject({
      '.gitignore': '**/*.test.js',
    });
    const shouldWatch = buildIgnoreFilter(project.dir);

    expect(shouldWatch(path.join(project.dir, 'src/app.test.js'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, 'tests/unit/foo.test.js'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, 'src/app.js'))).toBe(true);
  });

  test('no .gitignore: only defaults apply, no crash', () => {
    project = createTempProject({
      'src/app.js': 'hello',
    });
    // No .gitignore present
    expect(fs.existsSync(path.join(project.dir, '.gitignore'))).toBe(false);

    const shouldWatch = buildIgnoreFilter(project.dir);
    expect(shouldWatch(path.join(project.dir, 'src/app.js'))).toBe(true);
    expect(shouldWatch(path.join(project.dir, 'node_modules/x.js'))).toBe(false);
  });

  test('no .snaprevertignore: only defaults + .gitignore, no crash', () => {
    project = createTempProject({
      'src/app.js': 'hello',
      '.gitignore': '*.log',
    });
    expect(fs.existsSync(path.join(project.dir, '.snaprevertignore'))).toBe(false);

    const shouldWatch = buildIgnoreFilter(project.dir);
    expect(shouldWatch(path.join(project.dir, 'src/app.js'))).toBe(true);
    expect(shouldWatch(path.join(project.dir, 'error.log'))).toBe(false);
  });

  test('empty .gitignore: no additional ignores', () => {
    project = createTempProject({
      'src/app.js': 'hello',
      '.gitignore': '',
    });
    const shouldWatch = buildIgnoreFilter(project.dir);

    // Only defaults apply; regular files are still watched
    expect(shouldWatch(path.join(project.dir, 'src/app.js'))).toBe(true);
    expect(shouldWatch(path.join(project.dir, 'node_modules/x.js'))).toBe(false);
  });

  test('comment lines: lines starting with # are ignored', () => {
    project = createTempProject({
      '.gitignore': '# This is a comment\n*.log\n# Another comment\n',
    });
    const lines = parseIgnoreFile(path.join(project.dir, '.gitignore'));

    expect(lines).toEqual(['*.log']);
    expect(lines).not.toContain('# This is a comment');
    expect(lines).not.toContain('# Another comment');
  });

  test('shouldWatch returns true for source files: src/app.js -> true', () => {
    project = createTempProject({
      'src/app.js': 'const x = 1;',
    });
    const shouldWatch = buildIgnoreFilter(project.dir);

    expect(shouldWatch(path.join(project.dir, 'src/app.js'))).toBe(true);
    expect(shouldWatch(path.join(project.dir, 'lib/utils.js'))).toBe(true);
    expect(shouldWatch(path.join(project.dir, 'index.html'))).toBe(true);
  });

  test('shouldWatch returns false for node_modules: node_modules/x/y.js -> false', () => {
    project = createTempProject({});
    const shouldWatch = buildIgnoreFilter(project.dir);

    expect(shouldWatch(path.join(project.dir, 'node_modules/x/y.js'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, 'node_modules/express/lib/router.js'))).toBe(false);
    expect(shouldWatch(path.join(project.dir, 'node_modules/.package-lock.json'))).toBe(false);
  });
});
