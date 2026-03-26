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

/**
 * Helper to create a fake snapshot on disk.
 */
function createFakeSnapshot(dir, number, label, timestampOverride) {
  const timestamp = timestampOverride || (Date.now() + number);
  const name = `${timestamp}-fake${number}`;
  const meta = {
    timestamp,
    id: `fake${number}`,
    name,
    number,
    label,
    status: 'active',
    changes: [{ type: 'added', filePath: `file${number}.txt`, size: 10 }],
    totalSize: 100,
  };
  saveSnapshot(dir, name, meta, {}, {});
  return meta;
}

describe('CLI: config and cleanup commands', () => {
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

  test('snaprevert config shows all settings', () => {
    const output = run('config', dir);

    expect(output).toMatch(/snaprevert config/i);
    expect(output).toMatch(/debounce_ms/);
    expect(output).toMatch(/retention_days/);
    expect(output).toMatch(/max_snapshots/);
    expect(output).toMatch(/max_file_size_kb/);
    expect(output).toMatch(/auto_label/);
    expect(output).toMatch(/ignore_patterns/);
  });

  test('snaprevert config debounce_ms 5000 updates setting', () => {
    const output = run('config debounce_ms 5000', dir);

    expect(output).toMatch(/debounce_ms = 5000/);

    // Verify persisted
    const configPath = path.join(dir, '.snaprevert', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.debounce_ms).toBe(5000);
  });

  test('snaprevert config --reset resets to defaults', () => {
    // First change a setting
    run('config debounce_ms 5000', dir);

    // Verify it changed
    const configPath = path.join(dir, '.snaprevert', 'config.json');
    let config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.debounce_ms).toBe(5000);

    // Reset
    const output = run('config --reset', dir);

    expect(output).toMatch(/reset to defaults/i);

    // Verify reset
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.debounce_ms).toBe(3000);
    expect(config.retention_days).toBe(30);
    expect(config.max_snapshots).toBe(500);
  });

  test('snaprevert cleanup --dry shows what would be pruned', () => {
    // Create some snapshots with recent timestamps
    for (let i = 1; i <= 3; i++) {
      createFakeSnapshot(dir, i, `snap-${i}`);
    }

    const output = run('cleanup --dry', dir);

    // With default retention (30 days), recent snapshots won't be pruned
    // Should show "nothing to prune"
    expect(output).toMatch(/nothing to prune/i);
  });

  test('snaprevert cleanup --keep 5', () => {
    // Create 3 snapshots directly on disk
    for (let i = 1; i <= 3; i++) {
      createFakeSnapshot(dir, i, `cleanup-${i}`);
    }

    const output = run('cleanup --keep 5', dir);

    // We only have 3, and keep is 5, so nothing to prune
    expect(output).toMatch(/nothing to prune/i);

    // Verify all snapshots still exist
    const snapshotsDir = path.join(dir, '.snaprevert', 'snapshots');
    const entries = fs.readdirSync(snapshotsDir);
    expect(entries.length).toBe(3);
  });
});
