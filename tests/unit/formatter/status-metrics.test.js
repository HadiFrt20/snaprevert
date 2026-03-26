const { renderStatus } = require('../../../src/formatter/status-renderer');

describe('status renderer enhanced metrics', () => {
  function makeBaseInfo(overrides = {}) {
    return {
      projectDir: '/tmp/test-project',
      totalSnapshots: 10,
      active: 8,
      rolledBack: 1,
      restored: 1,
      storageSize: 2048,
      current: 10,
      totalFilesTouched: 15,
      mostChanged: [],
      toolBreakdown: {},
      hasToolData: false,
      recentSnapshots: 5,
      recentFilesTouched: 8,
      recentRollbacks: 1,
      avgPerHour: 2,
      storageTrend: null,
      watchingSince: Date.now() - 86400000,
      ...overrides,
    };
  }

  test('renders AI TOOLS section when tool data present', () => {
    const info = makeBaseInfo({
      hasToolData: true,
      toolBreakdown: {
        claude: 5,
        cursor: 3,
      },
      totalSnapshots: 10,
    });

    const output = renderStatus(info);

    expect(output).toContain('AI TOOLS');
    expect(output).toContain('claude');
    expect(output).toContain('5 snapshots');
    expect(output).toContain('cursor');
    expect(output).toContain('3 snapshots');
    // 10 total - 8 known = 2 unknown
    expect(output).toContain('unknown');
    expect(output).toContain('2 snapshots');
  });

  test('hides AI TOOLS section when no tool data', () => {
    const info = makeBaseInfo({
      hasToolData: false,
      toolBreakdown: {},
    });

    const output = renderStatus(info);

    expect(output).not.toContain('AI TOOLS');
  });

  test('renders MOST CHANGED FILES when enough data', () => {
    const info = makeBaseInfo({
      mostChanged: [
        { filePath: 'src/index.js', count: 12 },
        { filePath: 'src/app.js', count: 8 },
        { filePath: 'src/utils.js', count: 5 },
        { filePath: 'src/config.js', count: 3 },
      ],
    });

    const output = renderStatus(info);

    expect(output).toContain('MOST CHANGED FILES');
    expect(output).toContain('src/index.js');
    expect(output).toContain('12 changes');
    expect(output).toContain('src/app.js');
    expect(output).toContain('8 changes');
    expect(output).toContain('src/utils.js');
    expect(output).toContain('5 changes');
    expect(output).toContain('src/config.js');
    expect(output).toContain('3 changes');
  });

  test('renders ACTIVITY section with correct metrics', () => {
    const info = makeBaseInfo({
      recentSnapshots: 12,
      recentFilesTouched: 25,
      recentRollbacks: 3,
      avgPerHour: 4,
    });

    const output = renderStatus(info);

    expect(output).toContain('ACTIVITY');
    expect(output).toContain('last 24h');
    // Check snapshot count
    expect(output).toContain('12');
    // Check avg per hour
    expect(output).toContain('avg 4/hr');
    // Check files touched
    expect(output).toContain('25');
    expect(output).toContain('unique files');
    // Check rollbacks
    expect(output).toContain('3');
  });
});
