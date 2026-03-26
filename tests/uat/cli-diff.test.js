const { execSync } = require('child_process');
const path = require('path');
const { createTempProject } = require('../helpers/temp-project');
const store = require('../../src/storage/store');

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

describe('CLI: diff command', () => {
  let dir, cleanup;

  beforeEach(() => {
    const tmp = createTempProject({
      'index.js': 'console.log("hello");',
      'lib/util.js': 'module.exports = { add: (a, b) => a + b };',
    });
    dir = tmp.dir;
    cleanup = tmp.cleanup;
    store.init(dir);
  });

  afterEach(() => {
    cleanup();
  });

  test('snaprevert diff <N> shows file changes', () => {
    // Create a snapshot first
    run('snap --label "initial"', dir);

    const output = run('diff 1', dir);

    // Should show file names from the snapshot
    expect(output).toMatch(/index\.js/);
    expect(output).toMatch(/lib\/util\.js|lib__util\.js/);
  });

  test('snaprevert diff <N> --files-only', () => {
    run('snap --label "files-only-test"', dir);

    const output = run('diff 1 --files-only', dir);

    // Should list files but not show inline diffs
    expect(output).toMatch(/index\.js/);
    // The output should be more concise than full diff
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });

  test('snaprevert diff 999 (non-existent) returns error exit code 1', () => {
    // Create at least one snapshot so .snaprevert is valid
    run('snap --label "test"', dir);

    const result = runSafe('diff 999', dir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not found/i);
  });

  test('snaprevert diff without number shows error', () => {
    // diff requires a <number> argument
    const result = runSafe('diff', dir);

    // Commander should error because <number> is required
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
