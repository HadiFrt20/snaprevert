const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createTempProject, addFile } = require('../helpers/temp-project');
const store = require('../../src/storage/store');
const { saveSnapshot } = require('../../src/storage/serializer');
const { computeDiff } = require('../../src/storage/differ');

const CLI_PATH = path.resolve(__dirname, '../../bin/snaprevert.js');

function run(cmd, dir) {
  return execSync(`node ${CLI_PATH} ${cmd}`, {
    cwd: dir,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
}

function runSafe(cmd, dir) {
  try {
    return { stdout: run(cmd, dir), exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.status };
  }
}

/**
 * Helper: create a snapshot with modified files (has diffs).
 */
function createSnapshotWithDiff(dir, number, filePath, oldContent, newContent) {
  const timestamp = Date.now() + number;
  const name = `${timestamp}-snap${number}`;
  const diff = computeDiff(oldContent, newContent);
  const meta = {
    timestamp,
    id: `snap${number}`,
    name,
    number,
    label: `snapshot #${number}`,
    status: 'active',
    type: 'snapshot',
    changes: [{ filePath, type: 'modified', size: newContent.length }],
    totalSize: 100,
  };
  saveSnapshot(dir, name, meta, diff ? { [filePath]: diff } : {}, {});
  return name;
}

/**
 * Helper: create a snapshot with added files.
 */
function createSnapshotWithAdded(dir, number, filePath, content) {
  const timestamp = Date.now() + number;
  const name = `${timestamp}-snap${number}`;
  const meta = {
    timestamp,
    id: `snap${number}`,
    name,
    number,
    label: `snapshot #${number}`,
    status: 'active',
    type: 'snapshot',
    changes: [{ filePath, type: 'added', size: content.length }],
    totalSize: content.length,
  };
  saveSnapshot(dir, name, meta, {}, { [filePath]: content });
  return name;
}

describe('CLI: export command', () => {
  let dir, cleanup;

  beforeEach(() => {
    const tmp = createTempProject({
      'index.js': 'console.log("hello");',
    });
    dir = tmp.dir;
    cleanup = tmp.cleanup;
    store.init(dir);
  });

  afterEach(() => {
    cleanup();
  });

  test('snaprevert export <N> --patch outputs unified diff format', () => {
    const oldContent = 'line1\nline2\nline3';
    const newContent = 'line1\nline2-modified\nline3';
    addFile(dir, 'app.js', newContent);
    createSnapshotWithDiff(dir, 1, 'app.js', oldContent, newContent);

    const output = run('export 1 --patch', dir);

    // Unified diff should contain diff markers
    expect(output).toContain('---');
    expect(output).toContain('+++');
    expect(output).toContain('@@');
  });

  test('snaprevert export <N> --json outputs valid JSON', () => {
    createSnapshotWithAdded(dir, 1, 'new-file.js', 'hello world');

    const output = run('export 1 --json', dir);

    const parsed = JSON.parse(output);
    expect(parsed).toBeDefined();
    expect(parsed.meta).toBeDefined();
    expect(parsed.meta.number).toBe(1);
    expect(parsed.addedFiles).toBeDefined();
    expect(parsed.addedFiles['new-file.js']).toBe('hello world');
  });

  test('snaprevert export <N> --file writes to specified path', () => {
    const oldContent = 'original';
    const newContent = 'updated';
    addFile(dir, 'data.js', newContent);
    createSnapshotWithDiff(dir, 1, 'data.js', oldContent, newContent);

    const outputFile = path.join(dir, 'export-output.patch');
    const output = run(`export 1 --file "${outputFile}"`, dir);

    expect(output).toContain('Patch written to');
    expect(fs.existsSync(outputFile)).toBe(true);
    const fileContent = fs.readFileSync(outputFile, 'utf-8');
    expect(fileContent).toContain('---');
    expect(fileContent).toContain('+++');
  });

  test('snaprevert export 999 returns error', () => {
    createSnapshotWithAdded(dir, 1, 'file.js', 'content');

    const result = runSafe('export 999', dir);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/not found/i);
  });

  test('export output contains file paths and diff markers', () => {
    const oldContent = 'function hello() {\n  return "hi";\n}';
    const newContent = 'function hello() {\n  return "hello world";\n}';
    addFile(dir, 'src/greeting.js', newContent);
    createSnapshotWithDiff(dir, 1, 'src/greeting.js', oldContent, newContent);

    const output = run('export 1', dir);

    // Should contain the file path in the diff headers
    expect(output).toContain('src/greeting.js');
    // Should have diff markers
    expect(output).toContain('---');
    expect(output).toContain('+++');
    expect(output).toContain('@@');
  });
});
