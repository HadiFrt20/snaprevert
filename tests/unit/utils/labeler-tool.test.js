const { generateLabel } = require('../../../src/utils/labeler');

describe('labeler with tool parameter', () => {
  test('label with tool prefix: "claude: modified auth.js"', () => {
    const changes = [
      { type: 'modified', filePath: 'src/auth.js' },
    ];
    const label = generateLabel(changes, 'claude');
    expect(label).toBe('claude: modified auth.js');
  });

  test('label without tool: no prefix', () => {
    const changes = [
      { type: 'modified', filePath: 'src/auth.js' },
    ];
    // No tool parameter
    const label = generateLabel(changes);
    expect(label).toBe('modified auth.js');
    // Explicitly null tool
    const label2 = generateLabel(changes, null);
    expect(label2).toBe('modified auth.js');
  });

  test('label with tool and many files: "cursor: modified 8 files in src/"', () => {
    // More than 5 files triggers the summary path
    const changes = [
      { type: 'modified', filePath: 'src/a.js' },
      { type: 'modified', filePath: 'src/b.js' },
      { type: 'modified', filePath: 'src/c.js' },
      { type: 'modified', filePath: 'src/d.js' },
      { type: 'modified', filePath: 'src/e.js' },
      { type: 'modified', filePath: 'src/f.js' },
      { type: 'modified', filePath: 'src/g.js' },
      { type: 'modified', filePath: 'src/h.js' },
    ];
    const label = generateLabel(changes, 'cursor');
    expect(label).toBe('cursor: modified 8 files in src/');
  });
});
