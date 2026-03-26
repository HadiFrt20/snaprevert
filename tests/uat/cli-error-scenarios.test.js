const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createTempProject, addFile } = require('../helpers/temp-project');
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
    const stdout = execSync(`node ${CLI_PATH} ${cmd}`, {
      cwd: dir,
      encoding: 'utf-8',
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status,
    };
  }
}

describe('CLI: error scenarios', () => {
  let dir, cleanup;

  beforeEach(() => {
    const tmp = createTempProject({
      'index.js': 'console.log("hello");',
    });
    dir = tmp.dir;
    cleanup = tmp.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  test('run command outside project (no .snaprevert/)', () => {
    // Do NOT init - there is no .snaprevert/
    const result = runSafe('list', dir);

    expect(result.exitCode).toBe(1);
    // Error message may be in stdout or stderr depending on console.log vs console.error
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/no .snaprevert\/ found/i);
  });

  test('corrupt state.json', () => {
    store.init(dir);

    // Corrupt the state.json
    const statePath = path.join(dir, '.snaprevert', 'state.json');
    fs.writeFileSync(statePath, '{{{INVALID JSON', 'utf-8');

    // status reads state but should handle corruption gracefully
    const result = runSafe('status', dir);

    // Should not crash with an unhandled exception -- state module returns defaults
    expect(result.exitCode).toBe(0);
  });

  test('delete .snaprevert/ then run list', () => {
    store.init(dir);
    run('snap', dir);

    // Now remove .snaprevert entirely
    fs.rmSync(path.join(dir, '.snaprevert'), { recursive: true, force: true });

    const result = runSafe('list', dir);

    expect(result.exitCode).toBe(1);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/no .snaprevert\/ found/i);
  });

  test('snaprevert --help shows all commands', () => {
    const output = run('--help', dir);

    expect(output).toMatch(/watch/);
    expect(output).toMatch(/snap/);
    expect(output).toMatch(/list/);
    expect(output).toMatch(/diff/);
    expect(output).toMatch(/back/);
    expect(output).toMatch(/restore/);
    expect(output).toMatch(/config/);
    expect(output).toMatch(/status/);
    expect(output).toMatch(/cleanup/);
  });

  test('snaprevert --version shows version', () => {
    const output = run('--version', dir);

    // Should print the version from package.json
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('snaprevert (no args) shows help', () => {
    // Commander outputs help to stderr and exits non-zero when no command given
    const result = runSafe('', dir);

    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Usage|snaprevert/i);
  });

  test('very large file handled', () => {
    store.init(dir);

    // Create a large file (~500KB)
    const largeContent = 'x'.repeat(500 * 1024);
    addFile(dir, 'large-file.txt', largeContent);

    const result = runSafe('snap --label "large file"', dir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/snapshot #1 created/);

    // Verify snapshot was created
    const snapshotsDir = path.join(dir, '.snaprevert', 'snapshots');
    const entries = fs.readdirSync(snapshotsDir);
    expect(entries.length).toBe(1);
  });

  test('project with 1000+ files', () => {
    store.init(dir);

    // Create 1000+ files
    for (let i = 0; i < 1010; i++) {
      const subdir = `dir${Math.floor(i / 100)}`;
      addFile(dir, `${subdir}/file${i}.txt`, `content of file ${i}`);
    }

    const result = runSafe('snap --label "many files"', dir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/snapshot #1 created/);
  }, 30000);

  test('invalid snapshot number for diff', () => {
    store.init(dir);
    run('snap --label "test"', dir);

    const result = runSafe('diff abc', dir);

    expect(result.exitCode).toBe(1);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/invalid snapshot number/i);
  });

  test('non-existent snapshot for diff', () => {
    store.init(dir);
    run('snap --label "test"', dir);

    const result = runSafe('diff 999', dir);

    expect(result.exitCode).toBe(1);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/not found/i);
  });
});
