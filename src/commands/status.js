const chalk = require('chalk');
const { listSnapshots } = require('../storage/serializer');
const { isInitialized, getTotalSize } = require('../storage/store');
const { getCurrentState } = require('../engine/state');
const { renderStatus } = require('../formatter/status-renderer');

module.exports = function status(_opts) {
  const projectDir = process.cwd();

  if (!isInitialized(projectDir)) {
    console.error(chalk.red('\n  no .snaprevert/ found. run snaprevert watch to start.\n'));
    process.exit(1);
  }

  const snapshots = listSnapshots(projectDir);
  const state = getCurrentState(projectDir);

  // Basic counts
  const active = snapshots.filter((s) => s.status === 'active').length;
  const rolledBack = snapshots.filter((s) => s.status === 'rolled-back').length;
  const restored = snapshots.filter((s) => s.status === 'restored').length;

  // Total unique files touched across all snapshots
  const fileCountMap = {};
  for (const snap of snapshots) {
    const files = snap.files || [];
    for (const f of files) {
      fileCountMap[f] = (fileCountMap[f] || 0) + 1;
    }
  }
  const totalFilesTouched = Object.keys(fileCountMap).length;

  // Most changed files (top 5)
  const mostChanged = Object.entries(fileCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([filePath, count]) => ({ filePath, count }));

  // AI tool breakdown — count snapshots by meta.tool
  const toolBreakdown = {};
  for (const snap of snapshots) {
    const tool = (snap.meta && snap.meta.tool) || snap.tool || null;
    if (tool) {
      toolBreakdown[tool] = (toolBreakdown[tool] || 0) + 1;
    }
  }
  const hasToolData = Object.keys(toolBreakdown).length > 0;

  // Activity in the last 24 hours
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const recent = snapshots.filter((s) => s.timestamp && s.timestamp >= oneDayAgo);
  const recentRollbacks = recent.filter((s) => s.status === 'rolled-back').length;
  const recentFilesSet = new Set();
  for (const snap of recent) {
    for (const f of snap.files || []) {
      recentFilesSet.add(f);
    }
  }

  // Snapshot frequency — average per hour over last 24h
  const hoursElapsed = recent.length > 0
    ? Math.max(1, (now - Math.min(...recent.map((s) => s.timestamp))) / 3600000)
    : 24;
  const avgPerHour = recent.length > 0
    ? Math.round(recent.length / hoursElapsed)
    : 0;

  // Storage growth trend — size of oldest vs newest
  let storageTrend = null;
  if (snapshots.length >= 2) {
    const oldest = snapshots[0];
    const newest = snapshots[snapshots.length - 1];
    if (oldest.size !== null && newest.size !== null) {
      storageTrend = { oldestSize: oldest.size, newestSize: newest.size };
    }
  }

  // Watching since — timestamp of the first snapshot
  const watchingSince = snapshots.length > 0 ? snapshots[0].timestamp : null;

  const info = {
    projectDir,
    totalSnapshots: snapshots.length,
    active,
    rolledBack,
    restored,
    storageSize: getTotalSize(projectDir),
    current: state.current,
    totalFilesTouched,
    mostChanged,
    toolBreakdown,
    hasToolData,
    recentSnapshots: recent.length,
    recentFilesTouched: recentFilesSet.size,
    recentRollbacks,
    avgPerHour,
    storageTrend,
    watchingSince,
  };

  console.log(renderStatus(info));
};
