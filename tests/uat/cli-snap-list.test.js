const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createTempProject } = require('../helpers/temp-project');
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
 * Helper to create a fake snapshot directly on disk (since manual snap only
 * works for the first snapshot -- subsequent snaps detect no changes because
 * the ChangeBuffer is recreated each time with a fresh cache).
 */
function createFakeSnapshot(dir, number, label, changes) {
  const timestamp = Date.now() + number;
  const name = `${timestamp}-fake${number}`;
  const meta = {
    timestamp,
    id: `fake${number}`,
    name,
    number,
    label,
    status: 'active',
    changes: changes || [{ type: 'added', filePath: `file${number}.txt`, size: 10 }],
    totalSize: 100,
  };
  saveSnapshot(dir, name, meta, {}, {});
  return meta;
}

describe('CLI: snap and list commands', () => {
  let dir, cleanup;

  beforeEach(() => {
    const tmp = createTempProject({
      'index.js': 'console.log("hello");',
      'readme.txt': 'This is a readme.',
      'src/app.js': 'module.exports = {};',
    });
    dir = tmp.dir;
    cleanup = tmp.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  test('snaprevert snap creates manual snapshot, exit code 0', () => {
    store.init(dir);

    const result = runSafe('snap', dir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/snapshot #1 created/);

    // Verify snapshot directory was created
    const snapshotsDir = path.join(dir, '.snaprevert', 'snapshots');
    const entries = fs.readdirSync(snapshotsDir);
    expect(entries.length).toBe(1);
  });

  test('snaprevert snap --label "before refactor" creates labeled snapshot', () => {
    store.init(dir);

    const result = runSafe('snap --label "before refactor"', dir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/snapshot #1 created/);
    expect(result.stdout).toMatch(/before refactor/);

    // Verify meta has the label
    const snapshotsDir = path.join(dir, '.snaprevert', 'snapshots');
    const entries = fs.readdirSync(snapshotsDir);
    const metaPath = path.join(snapshotsDir, entries[0], 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    expect(meta.label).toBe('before refactor');
  });

  test('snaprevert list shows table after creating snapshots', () => {
    store.init(dir);

    // Create first snapshot via CLI
    run('snap --label "first"', dir);

    // Create a second snapshot directly on disk since manual snap
    // cannot detect changes on subsequent runs (fresh ChangeBuffer each time)
    createFakeSnapshot(dir, 2, 'second');

    const output = run('list', dir);

    expect(output).toMatch(/snapshots/i);
    expect(output).toMatch(/first/);
    expect(output).toMatch(/second/);
  });

  test('snaprevert list --limit 5', () => {
    store.init(dir);

    // Create multiple snapshots directly
    createFakeSnapshot(dir, 1, 'snap-0');
    createFakeSnapshot(dir, 2, 'snap-1');
    createFakeSnapshot(dir, 3, 'snap-2');

    const output = run('list --limit 5', dir);

    // Should show all 3 since we have fewer than the limit
    expect(output).toMatch(/snap-0/);
    expect(output).toMatch(/snap-1/);
    expect(output).toMatch(/snap-2/);
  });

  test('snaprevert list --json outputs valid JSON', () => {
    store.init(dir);

    run('snap --label "json-test"', dir);

    const output = run('list --json', dir);

    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].label).toBe('json-test');
    expect(parsed[0].number).toBe(1);
    expect(parsed[0].status).toBe('active');
  });

  test('snaprevert list with no snapshots shows message', () => {
    store.init(dir);

    const output = run('list', dir);

    expect(output).toMatch(/no snapshots yet/i);
  });
});
