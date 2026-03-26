const chalk = require('chalk');
const { renderDiff } = require('../../../src/formatter/diff-renderer');

const level = chalk.level;
beforeAll(() => { chalk.level = 0; });
afterAll(() => { chalk.level = level; });

describe('diff-renderer', () => {
  function makeSnapshot(changes, diffs = {}, addedFiles = {}) {
    return {
      meta: {
        number: 1,
        label: 'test snapshot',
        timestamp: Date.now() - 5000,
        changes,
        totalSize: 100,
      },
      diffs,
      addedFiles,
    };
  }

  test('render file summary with add/modify/delete indicators', () => {
    const snapshot = makeSnapshot([
      { filePath: 'new.js', type: 'added' },
      { filePath: 'changed.js', type: 'modified' },
      { filePath: 'gone.js', type: 'deleted' },
    ], {}, { 'new.js': 'content\nhere' });

    const output = renderDiff(snapshot, { filesOnly: true });
    expect(output).toContain('+ new.js');
    expect(output).toContain('~ changed.js');
    expect(output).toContain('- gone.js');
  });

  test('render inline diff with +/- lines', () => {
    const diffContent = [
      '--- a',
      '+++ b',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-old line',
      '+new line',
      ' line3',
    ].join('\n');

    const snapshot = makeSnapshot(
      [{ filePath: 'app.js', type: 'modified' }],
      { 'app.js': diffContent },
      {}
    );

    const output = renderDiff(snapshot);
    expect(output).toContain('+new line');
    expect(output).toContain('-old line');
    expect(output).toContain('line1');
  });

  test('render added file with "(new -- N lines)"', () => {
    const content = 'line1\nline2\nline3';
    const snapshot = makeSnapshot(
      [{ filePath: 'brand-new.js', type: 'added' }],
      {},
      { 'brand-new.js': content }
    );

    const output = renderDiff(snapshot);
    // The renderer uses an em-dash character
    expect(output).toMatch(/new.*3 lines/);
    expect(output).toContain('+ brand-new.js');
  });

  test('render deleted file with "(deleted)"', () => {
    const snapshot = makeSnapshot(
      [{ filePath: 'removed.js', type: 'deleted' }],
      {},
      {}
    );

    const output = renderDiff(snapshot);
    expect(output).toContain('- removed.js');
    expect(output).toContain('(deleted)');
  });

  test('render with filesOnly option', () => {
    const diffContent = '@@ -1,1 +1,1 @@\n-old\n+new';
    const snapshot = makeSnapshot(
      [{ filePath: 'mod.js', type: 'modified' }],
      { 'mod.js': diffContent },
      {}
    );

    const withDiff = renderDiff(snapshot);
    const filesOnly = renderDiff(snapshot, { filesOnly: true });

    // filesOnly should not contain the inline diff content
    expect(withDiff).toContain('-old');
    expect(withDiff).toContain('+new');
    expect(filesOnly).toContain('~ mod.js');
    expect(filesOnly).not.toContain('-old');
    expect(filesOnly).not.toContain('+new');
  });

  test('render section headers', () => {
    const diffContent = '@@ -1,1 +1,1 @@\n-x\n+y';
    const snapshot = makeSnapshot(
      [{ filePath: 'src/main.js', type: 'modified' }],
      { 'src/main.js': diffContent },
      {}
    );

    const output = renderDiff(snapshot);
    // Section header for modified file
    expect(output).toContain('src/main.js');
    // Snapshot header
    expect(output).toContain('snapshot #1');
    expect(output).toContain('test snapshot');
  });
});
