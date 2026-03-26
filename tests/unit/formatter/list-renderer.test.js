const chalk = require('chalk');
const { renderList, formatFileChanges } = require('../../../src/formatter/list-renderer');

// Disable chalk colors for predictable assertions
const level = chalk.level;
beforeAll(() => { chalk.level = 0; });
afterAll(() => { chalk.level = level; });

describe('list-renderer', () => {
  test('render empty list', () => {
    const output = renderList([], '/some/project', 0);
    expect(output).toContain('no snapshots yet');
    expect(output).toContain('snaprevert watch');
  });

  test('render single snapshot', () => {
    const snapshots = [{
      number: 1,
      timestamp: Date.now() - 5000,
      label: 'initial commit',
      status: 'active',
      changes: [{ type: 'added', filePath: 'index.js' }],
      totalSize: 256,
    }];
    const output = renderList(snapshots, '/my/project', 256);
    expect(output).toContain('1 snapshots');
    expect(output).toContain('initial commit');
    expect(output).toContain('/my/project');
  });

  test('render 20 snapshots', () => {
    const snapshots = [];
    for (let i = 1; i <= 20; i++) {
      snapshots.push({
        number: i,
        timestamp: Date.now() - (21 - i) * 60000,
        label: `snap ${i}`,
        status: 'active',
        changes: [{ type: 'modified', filePath: `file${i}.js` }],
        totalSize: 100 * i,
      });
    }
    const output = renderList(snapshots, '/proj', 100 * 210);
    // All 20 snapshots should appear
    for (let i = 1; i <= 20; i++) {
      expect(output).toContain(`snap ${i}`);
    }
  });

  test('columns present (#, TIME, FILES, SIZE, LABEL)', () => {
    const snapshots = [{
      number: 1,
      timestamp: Date.now(),
      label: 'test',
      status: 'active',
      changes: [],
      totalSize: 0,
    }];
    const output = renderList(snapshots, '/proj', 0);
    expect(output).toContain('#');
    expect(output).toContain('TIME');
    expect(output).toContain('FILES');
    expect(output).toContain('SIZE');
    expect(output).toContain('LABEL');
  });

  test('time formatting', () => {
    const snapshots = [{
      number: 1,
      timestamp: Date.now() - 3000, // 3 seconds ago
      label: 'recent',
      status: 'active',
      changes: [],
      totalSize: 0,
    }];
    const output = renderList(snapshots, '/proj', 0);
    expect(output).toMatch(/\d+s ago/);
  });

  test('file change summary format', () => {
    // Test formatFileChanges directly
    const changes = [
      { type: 'added', filePath: 'a.js' },
      { type: 'added', filePath: 'b.js' },
      { type: 'modified', filePath: 'c.js' },
      { type: 'deleted', filePath: 'd.js' },
    ];
    const result = formatFileChanges(changes);
    expect(result).toContain('+2');
    expect(result).toContain('~1');
    expect(result).toContain('-1');

    // Empty changes
    expect(formatFileChanges([])).toBe('-');
  });

  test('size formatting', () => {
    const snapshots = [{
      number: 1,
      timestamp: Date.now(),
      label: 'size-test',
      status: 'active',
      changes: [],
      totalSize: 512,
    }];
    const output = renderList(snapshots, '/proj', 512);
    expect(output).toContain('512B');
  });

  test('truncated label (>50 chars)', () => {
    const longLabel = 'a'.repeat(60);
    const snapshots = [{
      number: 1,
      timestamp: Date.now(),
      label: longLabel,
      status: 'active',
      changes: [],
      totalSize: 0,
    }];
    const output = renderList(snapshots, '/proj', 0);
    // Label should be truncated to 47 chars + '...'
    expect(output).toContain('a'.repeat(47) + '...');
    expect(output).not.toContain('a'.repeat(51));
  });

  test('rolled-back indicator', () => {
    const snapshots = [{
      number: 1,
      timestamp: Date.now(),
      label: 'rolled',
      status: 'rolled-back',
      changes: [],
      totalSize: 0,
    }];
    const output = renderList(snapshots, '/proj', 0);
    expect(output).toContain('[rolled back]');
  });
});
