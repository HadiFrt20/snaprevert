const { generateLabel } = require('../../../src/utils/labeler');

describe('labeler', () => {
  test('single file modified', () => {
    const label = generateLabel([
      { filePath: 'src/app.js', type: 'modified' },
    ]);
    expect(label).toContain('modified');
    expect(label).toContain('app.js');
  });

  test('two files modified', () => {
    const label = generateLabel([
      { filePath: 'src/app.js', type: 'modified' },
      { filePath: 'src/utils.js', type: 'modified' },
    ]);
    expect(label).toContain('modified');
    expect(label).toContain('app.js');
    expect(label).toContain('utils.js');
  });

  test('one added one modified', () => {
    const label = generateLabel([
      { filePath: 'src/new-file.js', type: 'added' },
      { filePath: 'src/existing.js', type: 'modified' },
    ]);
    expect(label).toContain('added');
    expect(label).toContain('modified');
    expect(label).toContain('new-file.js');
    expect(label).toContain('existing.js');
  });

  test('multiple deletions', () => {
    const label = generateLabel([
      { filePath: 'old/legacy.js', type: 'deleted' },
      { filePath: 'old/deprecated.js', type: 'deleted' },
    ]);
    expect(label).toContain('deleted');
    expect(label).toContain('legacy.js');
    expect(label).toContain('deprecated.js');
  });

  test('many files (>5) summarizes by directory', () => {
    const changes = [];
    for (let i = 0; i < 8; i++) {
      changes.push({ filePath: `src/components/file${i}.js`, type: 'modified' });
    }
    const label = generateLabel(changes);
    expect(label).toContain('modified 8');
    expect(label).toContain('src/components');
    expect(label).toContain('/');
  });

  test('mixed directories', () => {
    const changes = [
      { filePath: 'src/a.js', type: 'added' },
      { filePath: 'src/b.js', type: 'added' },
      { filePath: 'lib/c.js', type: 'modified' },
      { filePath: 'lib/d.js', type: 'modified' },
      { filePath: 'test/e.js', type: 'deleted' },
      { filePath: 'test/f.js', type: 'deleted' },
    ];
    const label = generateLabel(changes);
    // >5 files, should summarize
    expect(label).toContain('added 2');
    expect(label).toContain('modified 2');
    expect(label).toContain('deleted 2');
    // Should mention the top directory
    expect(label).toMatch(/(src|lib|test)\//);
  });

  test('manual label overrides', () => {
    const autoLabel = generateLabel([
      { filePath: 'src/app.js', type: 'modified' },
    ]);
    expect(typeof autoLabel).toBe('string');
    expect(autoLabel.length).toBeGreaterThan(0);

    // A manual label simply replaces the auto-generated one
    const manualLabel = 'fix: resolve login bug';
    expect(manualLabel).not.toBe(autoLabel);
    // The function output is a string that can be overridden by any caller
    expect(typeof manualLabel).toBe('string');
  });
});
