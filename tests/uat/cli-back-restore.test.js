const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createTempProject, addFile } = require('../helpers/temp-project');
const store = require('../../src/storage/store');
const { saveSnapshot } = require('../../src/storage/serializer');

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
 * Helper to create a snapshot that records a file addition on disk.
 * The snapshot stores the file content in the 'added' directory so
 * that rollback can remove it and restore can re-add it.
 */
function createAddedFileSnapshot(dir, number, label, filePath, content) {
  // Write the actual file to the project
  addFile(dir, filePath, content);

  const timestamp = Date.now() + number;
  const name = `${timestamp}-test${number}`;
  const meta = {
    timestamp,
    id: `test${number}`,
    name,
    number,
    label,
    status: 'active',
    changes: [{ type: 'added', filePath, size: Buffer.byteLength(content) }],
    totalSize: Buffer.byteLength(content),
  };
  const addedFiles = {};
  addedFiles[filePath] = content;
  saveSnapshot(dir, name, meta, {}, addedFiles);
  return meta;
}

/**
 * Helper to create a base snapshot (snapshot #1) with existing files.
 */
function createBaseSnapshot(dir, files) {
  const timestamp = Date.now();
  const name = `${timestamp}-base1`;
  const changes = [];
  const addedFiles = {};
  for (const [filePath, content] of Object.entries(files)) {
    changes.push({ type: 'added', filePath, size: Buffer.byteLength(content) });
    addedFiles[filePath] = content;
  }
  const meta = {
    timestamp,
    id: 'base1',
    name,
    number: 1,
    label: 'initial state',
    status: 'active',
    changes,
    totalSize: 100,
  };
  saveSnapshot(dir, name, meta, {}, addedFiles);
  return meta;
}

describe('CLI: back and restore commands', () => {
  let dir, cleanup;

  beforeEach(() => {
    const tmp = createTempProject({
      'index.js': 'console.log("v1");',
    });
    dir = tmp.dir;
    cleanup = tmp.cleanup;
    store.init(dir);
  });

  afterEach(() => {
    cleanup();
  });

  test('snaprevert back <N> --yes undoes snapshots', () => {
    // Create base snapshot #1
    createBaseSnapshot(dir, { 'index.js': 'console.log("v1");' });

    // Create snapshot #2 that adds a new file
    createAddedFileSnapshot(dir, 2, 'added newfile', 'newfile.txt', 'added in snapshot 2');

    // Verify the new file exists
    expect(fs.existsSync(path.join(dir, 'newfile.txt'))).toBe(true);

    // Roll back to snapshot #1 (undo snapshot #2)
    const output = run('back 1 --yes', dir);

    expect(output).toMatch(/rolled back to snapshot #1/i);

    // The file added in snapshot #2 should be removed
    expect(fs.existsSync(path.join(dir, 'newfile.txt'))).toBe(false);
  });

  test('snaprevert back <N> --dry shows what would change', () => {
    // Create base snapshot #1
    createBaseSnapshot(dir, { 'index.js': 'console.log("v1");' });

    // Create snapshot #2 that adds a file
    createAddedFileSnapshot(dir, 2, 'added extra', 'extra.txt', 'extra content');

    const output = run('back 1 --dry', dir);

    expect(output).toMatch(/dry mode/i);
    expect(output).toMatch(/undo/i);

    // File should still exist since it's dry mode
    expect(fs.existsSync(path.join(dir, 'extra.txt'))).toBe(true);
  });

  test('snaprevert restore <N> re-applies rolled-back snapshot', () => {
    // Create base snapshot #1
    createBaseSnapshot(dir, { 'index.js': 'console.log("v1");' });

    // Create snapshot #2 that adds a file
    createAddedFileSnapshot(dir, 2, 'to restore', 'restored-file.txt', 'to be restored');

    // Roll back to #1
    run('back 1 --yes', dir);
    expect(fs.existsSync(path.join(dir, 'restored-file.txt'))).toBe(false);

    // Restore snapshot #2
    const output = run('restore 2', dir);

    expect(output).toMatch(/restored snapshot #2/i);
    // File should be back
    expect(fs.existsSync(path.join(dir, 'restored-file.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'restored-file.txt'), 'utf-8')).toBe('to be restored');
  });

  test('snaprevert restore <N> on non-rolled-back snapshot returns error', () => {
    // Create a snapshot that is still active
    createBaseSnapshot(dir, { 'index.js': 'console.log("v1");' });

    const result = runSafe('restore 1', dir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not rolled back/i);
  });

  test('snaprevert status shows current state', () => {
    // Create at least one snapshot so status has something to show
    run('snap --label "status test"', dir);

    const output = run('status', dir);

    expect(output).toMatch(/snaprevert status/i);
    expect(output).toMatch(/snapshots/i);
    expect(output).toMatch(/active/i);
    expect(output).toMatch(/storage/i);
  });

  test('snaprevert back with no active snapshots after target shows message', () => {
    // Create only one snapshot
    createBaseSnapshot(dir, { 'index.js': 'console.log("v1");' });

    // Try to back to #1, but there are no snapshots after #1
    const output = run('back 1 --yes', dir);

    expect(output).toMatch(/no active snapshots after #1/i);
  });
});
