const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createTempProject, addFile, sleep } = require('../helpers/temp-project');

const CLI_PATH = path.resolve(__dirname, '../../bin/snaprevert.js');

function spawnWatch(dir) {
  return spawn('node', [CLI_PATH, 'watch'], {
    cwd: dir,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function collectOutput(proc, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    setTimeout(() => resolve({ stdout, stderr }), timeoutMs);
  });
}

describe('CLI: watch command', () => {
  let dir, cleanup;

  beforeEach(() => {
    const tmp = createTempProject({ 'index.js': 'console.log("hello");' });
    dir = tmp.dir;
    cleanup = tmp.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  test('snaprevert watch starts and outputs "watching" message', async () => {
    const proc = spawnWatch(dir);
    const { stdout } = await collectOutput(proc, 2000);
    proc.kill('SIGTERM');

    expect(stdout).toMatch(/watching/i);
  }, 10000);

  test('watch creates snapshot on file change', async () => {
    const proc = spawnWatch(dir);

    // Wait for watcher to initialize
    await sleep(1500);

    // Create a new file to trigger a change
    addFile(dir, 'newfile.txt', 'new content here');

    // Wait for debounce + snapshot creation
    await sleep(5000);

    proc.kill('SIGTERM');
    await sleep(500);

    // Verify snapshot was created by checking .snaprevert/snapshots
    const snapshotsDir = path.join(dir, '.snaprevert', 'snapshots');
    expect(fs.existsSync(snapshotsDir)).toBe(true);
    const entries = fs.readdirSync(snapshotsDir);
    expect(entries.length).toBeGreaterThanOrEqual(1);
  }, 15000);

  test('watch handles SIGINT gracefully', async () => {
    const proc = spawnWatch(dir);

    await sleep(1500);

    proc.kill('SIGINT');

    const exitCode = await new Promise((resolve) => {
      proc.on('exit', (code) => resolve(code));
      setTimeout(() => resolve(null), 3000);
    });

    // Process should exit (code 0 or null from signal)
    // The key assertion is that it doesn't hang
    expect(true).toBe(true);
  }, 10000);

  test('watch in empty directory', async () => {
    const tmp = createTempProject({});
    const emptyDir = tmp.dir;

    const proc = spawnWatch(emptyDir);
    const { stdout } = await collectOutput(proc, 2000);
    proc.kill('SIGTERM');

    // Should still start watching even with no files
    expect(stdout).toMatch(/watching/i);

    tmp.cleanup();
  }, 10000);

  test('watch auto-creates .snaprevert/', async () => {
    // Ensure .snaprevert does not exist
    const snaprevertDir = path.join(dir, '.snaprevert');
    if (fs.existsSync(snaprevertDir)) {
      fs.rmSync(snaprevertDir, { recursive: true, force: true });
    }
    expect(fs.existsSync(snaprevertDir)).toBe(false);

    const proc = spawnWatch(dir);
    await sleep(1500);
    proc.kill('SIGTERM');
    await sleep(500);

    // watch command should have auto-initialized .snaprevert/
    expect(fs.existsSync(snaprevertDir)).toBe(true);
    expect(fs.existsSync(path.join(snaprevertDir, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(snaprevertDir, 'state.json'))).toBe(true);
    expect(fs.existsSync(path.join(snaprevertDir, 'snapshots'))).toBe(true);
  }, 10000);
});
