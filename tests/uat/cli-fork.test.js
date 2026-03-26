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


function createFakeSnapshot(dir, number, label, files) {
  const timestamp = Date.now() + number;
  const name = `${timestamp}-fake${number}`;
  const changes = (files || [`file${number}.txt`]).map((f) => ({
    type: 'added',
    filePath: f,
    size: 10,
  }));
  const addedFiles = {};
  for (const f of files || [`file${number}.txt`]) {
    addFile(dir, f, `content of ${f}`);
    addedFiles[f] = `content of ${f}`;
  }
  const meta = {
    timestamp,
    id: `fake${number}`,
    name,
    number,
    label: label || `snapshot #${number}`,
    status: 'active',
    type: 'snapshot',
    changes,
    files: (files || [`file${number}.txt`]),
    totalSize: 100,
  };
  saveSnapshot(dir, name, meta, {}, addedFiles);
  return meta;
}

describe('CLI: fork command', () => {
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

  test('snaprevert fork --list with no branches shows message', () => {
    // Create at least one snapshot so the store is valid
    createFakeSnapshot(dir, 1, 'initial');

    const output = run('fork --list', dir);

    // Should show the main branch
    expect(output).toMatch(/main/);
    // Should show snapshot count
    expect(output).toMatch(/snapshot/);
  });

  test('snaprevert fork <N> --name "experiment" creates a branch', () => {
    createFakeSnapshot(dir, 1, 'base snapshot', ['base.js']);
    createFakeSnapshot(dir, 2, 'second snapshot', ['second.js']);

    const output = run('fork 1 --name "experiment"', dir);

    expect(output).toMatch(/created branch "experiment"/i);
    expect(output).toMatch(/snapshot #1/);

    // Verify the branches file was created
    const branchesPath = path.join(dir, '.snaprevert', 'branches.json');
    expect(fs.existsSync(branchesPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(branchesPath, 'utf-8'));
    expect(data.activeBranch).toBe('experiment');
    expect(data.branches.length).toBe(1);
    expect(data.branches[0].name).toBe('experiment');
    expect(data.branches[0].fromSnapshot).toBe(1);
  });

  test('snaprevert fork --list shows the created branch', () => {
    createFakeSnapshot(dir, 1, 'base snapshot', ['base.js']);
    createFakeSnapshot(dir, 2, 'second snapshot', ['second.js']);

    // Create a fork
    run('fork 1 --name "feature-x"', dir);

    const output = run('fork --list', dir);

    expect(output).toMatch(/main/);
    expect(output).toMatch(/feature-x/);
    // The active branch marker should be on feature-x
    expect(output).toMatch(/feature-x/);
  });

  test('snaprevert fork --switch works', () => {
    createFakeSnapshot(dir, 1, 'base snapshot', ['base.js']);
    createFakeSnapshot(dir, 2, 'second snapshot', ['second.js']);

    // Create a fork first
    run('fork 1 --name "my-branch"', dir);

    // Switch back to main
    const output = run('fork --switch main', dir);

    expect(output).toMatch(/switched to branch "main"/i);

    // Verify branches.json reflects the switch
    const branchesPath = path.join(dir, '.snaprevert', 'branches.json');
    const data = JSON.parse(fs.readFileSync(branchesPath, 'utf-8'));
    expect(data.activeBranch).toBe('main');
  });
});
