const fs = require('fs');
const { createTempProject } = require('../../helpers/temp-project');
const store = require('../../../src/storage/store');
const { DEFAULTS, loadConfig, updateConfig, resetConfig, getConfigPath } = require('../../../src/utils/config');

describe('config', () => {
  let project;

  beforeEach(() => {
    project = createTempProject({});
    store.init(project.dir);
  });

  afterEach(() => {
    project.cleanup();
  });

  test('default config', () => {
    const config = loadConfig(project.dir);
    expect(config.debounce_ms).toBe(3000);
    expect(config.retention_days).toBe(30);
    expect(config.max_snapshots).toBe(500);
    expect(config.max_file_size_kb).toBe(1024);
    expect(config.auto_label).toBe(true);
    expect(config.ignore_patterns).toEqual([]);
  });

  test('load existing config', () => {
    const configPath = getConfigPath(project.dir);
    const custom = { ...DEFAULTS, debounce_ms: 5000, retention_days: 7 };
    fs.writeFileSync(configPath, JSON.stringify(custom, null, 2), 'utf-8');

    const config = loadConfig(project.dir);
    expect(config.debounce_ms).toBe(5000);
    expect(config.retention_days).toBe(7);
    // Other defaults preserved
    expect(config.max_snapshots).toBe(500);
  });

  test('update config value', () => {
    const config = updateConfig(project.dir, 'debounce_ms', 1000);
    expect(config.debounce_ms).toBe(1000);

    // Persisted to disk
    const reloaded = loadConfig(project.dir);
    expect(reloaded.debounce_ms).toBe(1000);
  });

  test('reset config', () => {
    updateConfig(project.dir, 'max_snapshots', 100);
    expect(loadConfig(project.dir).max_snapshots).toBe(100);

    const config = resetConfig(project.dir);
    expect(config).toEqual(DEFAULTS);

    const reloaded = loadConfig(project.dir);
    expect(reloaded.max_snapshots).toBe(500);
  });

  test('invalid config value: error', () => {
    // Unknown key
    expect(() => updateConfig(project.dir, 'nonexistent_key', 42)).toThrow('Unknown config key');

    // Number out of range
    expect(() => updateConfig(project.dir, 'debounce_ms', 50)).toThrow('Invalid value');

    // Invalid boolean string
    expect(() => updateConfig(project.dir, 'auto_label', 'maybe')).toThrow('Invalid value');

    // NaN for number field
    expect(() => updateConfig(project.dir, 'debounce_ms', 'abc')).toThrow('must be a number');
  });

  test('missing config file: defaults created', () => {
    const configPath = getConfigPath(project.dir);
    // Remove the config file created by init
    fs.unlinkSync(configPath);

    const config = loadConfig(project.dir);
    expect(config).toEqual(DEFAULTS);
  });

  test('corrupt config file: recovery to defaults', () => {
    const configPath = getConfigPath(project.dir);
    fs.writeFileSync(configPath, '<<<NOT JSON>>>', 'utf-8');

    const config = loadConfig(project.dir);
    expect(config).toEqual(DEFAULTS);
  });
});
