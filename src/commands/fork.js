const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { listSnapshots } = require('../storage/serializer');
const { isInitialized, init, getStorePath, getSnapshotsPath } = require('../storage/store');
const { rollback } = require('../engine/rollback');
const { shortId } = require('../utils/hash');
const { setCurrentState } = require('../engine/state');
const { timeAgo } = require('../utils/timer');

const BRANCHES_FILE = 'branches.json';

function getBranchesPath(projectDir) {
  return path.join(getStorePath(projectDir), BRANCHES_FILE);
}

function loadBranches(projectDir) {
  const branchesPath = getBranchesPath(projectDir);
  try {
    if (fs.existsSync(branchesPath)) {
      return JSON.parse(fs.readFileSync(branchesPath, 'utf-8'));
    }
  } catch {
    // Corrupt file — return default
  }
  return { activeBranch: 'main', branches: [] };
}

function saveBranches(projectDir, data) {
  const branchesPath = getBranchesPath(projectDir);
  fs.writeFileSync(branchesPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Move snapshot directories from the active snapshots folder to a branch-specific
 * holding area, or restore them. For simplicity, branches just track which snapshot
 * numbers belong to them — snapshots stay in place but we filter by branch membership.
 */

function listBranches(projectDir) {
  const data = loadBranches(projectDir);
  const allSnapshots = listSnapshots(projectDir);

  console.log('');
  console.log(chalk.bold('  snapshot branches'));
  console.log('');

  // Show main branch
  const mainNumbers = getMainBranchNumbers(data, allSnapshots);
  const isMainActive = data.activeBranch === 'main';
  const mainMarker = isMainActive ? chalk.green(' *') : '';
  console.log(
    chalk.bold(`  main${mainMarker}`) +
    chalk.gray(` — ${mainNumbers.length} snapshot(s)`)
  );

  // Show other branches
  for (const branch of data.branches) {
    const isActive = data.activeBranch === branch.name;
    const marker = isActive ? chalk.green(' *') : '';
    console.log(
      chalk.bold(`  ${branch.name}${marker}`) +
      chalk.gray(` — ${branch.snapshots.length} snapshot(s), forked from #${branch.fromSnapshot}, ${timeAgo(branch.createdAt)}`)
    );
  }

  console.log('');
  if (data.activeBranch) {
    console.log(chalk.gray(`  active branch: ${data.activeBranch}`));
  }
  console.log('');
}

/**
 * Determine which snapshot numbers belong to the main branch.
 * Main branch = all snapshots NOT claimed by any other branch,
 * plus all snapshots up to the earliest fork point.
 */
function getMainBranchNumbers(data, allSnapshots) {
  const branchNumbers = new Set();
  for (const branch of data.branches) {
    for (const num of branch.snapshots) {
      branchNumbers.add(num);
    }
  }
  return allSnapshots
    .map((s) => s.number)
    .filter((n) => !branchNumbers.has(n));
}

async function switchBranch(projectDir, targetName) {
  const data = loadBranches(projectDir);

  if (data.activeBranch === targetName) {
    console.log(chalk.yellow(`\n  already on branch "${targetName}".\n`));
    return;
  }

  const allSnapshots = listSnapshots(projectDir);
  const snapshotsPath = getSnapshotsPath(projectDir);

  // Validate target branch exists
  const isMain = targetName === 'main';
  const targetBranch = isMain ? null : data.branches.find((b) => b.name === targetName);
  if (!isMain && !targetBranch) {
    console.error(chalk.red(`\n  branch "${targetName}" not found.\n`));
    process.exit(1);
  }

  // Determine which snapshots should be visible on the target branch
  let targetNumbers;
  if (isMain) {
    targetNumbers = new Set(getMainBranchNumbers(data, allSnapshots));
  } else {
    // Branch snapshots + all shared snapshots up to fork point
    const sharedNumbers = allSnapshots
      .filter((s) => s.number <= targetBranch.fromSnapshot)
      .map((s) => s.number);
    targetNumbers = new Set([...sharedNumbers, ...targetBranch.snapshots]);
  }

  // Find current branch snapshots that are NOT in target — hide them
  const currentBranchName = data.activeBranch;
  let currentExclusiveNumbers;
  if (currentBranchName === 'main') {
    const mainNums = getMainBranchNumbers(data, allSnapshots);
    currentExclusiveNumbers = mainNums.filter((n) => !targetNumbers.has(n));
  } else {
    const currentBranch = data.branches.find((b) => b.name === currentBranchName);
    currentExclusiveNumbers = currentBranch
      ? currentBranch.snapshots.filter((n) => !targetNumbers.has(n))
      : [];
  }

  // Hide current-branch-exclusive snapshots (move dirs to .snaprevert/_hidden_<branch>/)
  const hiddenDir = path.join(getStorePath(projectDir), `_hidden_${currentBranchName}`);
  if (currentExclusiveNumbers.length > 0) {
    if (!fs.existsSync(hiddenDir)) {
      fs.mkdirSync(hiddenDir, { recursive: true });
    }
    for (const num of currentExclusiveNumbers) {
      const snap = allSnapshots.find((s) => s.number === num);
      if (snap) {
        const src = path.join(snapshotsPath, snap.name);
        const dst = path.join(hiddenDir, snap.name);
        if (fs.existsSync(src)) {
          fs.renameSync(src, dst);
        }
      }
    }
  }

  // Restore target-branch snapshots from hidden storage
  const targetHiddenDir = path.join(getStorePath(projectDir), `_hidden_${targetName}`);
  if (fs.existsSync(targetHiddenDir)) {
    for (const entry of fs.readdirSync(targetHiddenDir)) {
      const src = path.join(targetHiddenDir, entry);
      const dst = path.join(snapshotsPath, entry);
      if (fs.statSync(src).isDirectory()) {
        fs.renameSync(src, dst);
      }
    }
    // Clean up empty hidden dir
    try { fs.rmdirSync(targetHiddenDir); } catch { /* ignore */ }
  }

  // Determine the fork point to rollback/restore to
  if (isMain || targetBranch) {
    const forkPoint = isMain
      ? Math.max(...getMainBranchNumbers(data, allSnapshots), 0)
      : targetBranch.fromSnapshot;

    // Find the highest active snapshot number on the target branch
    const restoredSnapshots = listSnapshots(projectDir);
    const targetActive = restoredSnapshots
      .filter((s) => s.status === 'active')
      .map((s) => s.number);

    const maxActive = targetActive.length > 0 ? Math.max(...targetActive) : forkPoint;
    setCurrentState(projectDir, maxActive, restoredSnapshots.length);
  }

  // Update active branch
  data.activeBranch = targetName;
  saveBranches(projectDir, data);

  console.log(chalk.green(`\n  switched to branch "${targetName}".\n`));
  console.log(chalk.gray('  run ') + chalk.bold('snaprevert list') + chalk.gray(' to see this branch\'s snapshots.\n'));
}

async function createFork(projectDir, number, name) {
  const num = parseInt(number, 10);
  if (isNaN(num)) {
    console.error(chalk.red('\n  invalid snapshot number.\n'));
    process.exit(1);
  }

  const allSnapshots = listSnapshots(projectDir);
  const target = allSnapshots.find((s) => s.number === num);

  if (!target) {
    console.error(chalk.red(`\n  snapshot #${num} not found.\n`));
    process.exit(1);
  }

  const data = loadBranches(projectDir);

  // Generate branch name if not provided
  const branchName = name || `branch-${shortId()}`;

  // Check for duplicate names
  if (data.branches.some((b) => b.name === branchName)) {
    console.error(chalk.red(`\n  branch "${branchName}" already exists.\n`));
    process.exit(1);
  }

  if (branchName === 'main') {
    console.error(chalk.red('\n  cannot create a branch named "main".\n'));
    process.exit(1);
  }

  // If currently on main, snapshots after the fork point belong to main
  // If on another branch, snapshots after fork point belong to that branch
  // Either way, we save the current state before forking.

  const afterForkSnapshots = allSnapshots
    .filter((s) => s.number > num && s.status === 'active')
    .map((s) => s.number);

  // If there are snapshots after the fork point on the current branch,
  // ensure they stay tracked under the current branch (if not main).
  if (data.activeBranch !== 'main' && afterForkSnapshots.length > 0) {
    const currentBranch = data.branches.find((b) => b.name === data.activeBranch);
    if (currentBranch) {
      // Current branch already tracks its own snapshots — no extra work
    }
  }

  // Create the new branch
  const branch = {
    name: branchName,
    createdAt: Date.now(),
    fromSnapshot: num,
    snapshots: [], // New snapshots created on this branch will be added here
  };

  data.branches.push(branch);

  // Rollback working directory to the fork point
  if (afterForkSnapshots.length > 0) {
    console.log(chalk.yellow(`\n  rolling back to snapshot #${num} for fork...\n`));
    try {
      rollback(projectDir, num);
    } catch (err) {
      console.error(chalk.red(`\n  rollback failed: ${err.message}\n`));
      process.exit(1);
    }
  }

  // Switch to the new branch
  data.activeBranch = branchName;
  saveBranches(projectDir, data);

  console.log(chalk.green(`\n  created branch "${branchName}" from snapshot #${num}\n`));
  console.log(chalk.gray(`  you are now on branch "${branchName}".`));
  console.log(chalk.gray('  new snapshots will be recorded on this branch.'));
  console.log(chalk.gray('  use ') + chalk.bold('snaprevert fork --list') + chalk.gray(' to see all branches.'));
  console.log(chalk.gray('  use ') + chalk.bold(`snaprevert fork --switch main`) + chalk.gray(' to go back.\n'));
}

module.exports = async function fork(number, opts) {
  const projectDir = process.cwd();

  if (!isInitialized(projectDir)) {
    console.error(chalk.red('\n  no .snaprevert/ found. run snaprevert watch to start.\n'));
    process.exit(1);
  }

  init(projectDir);

  // Initialize branches file if it doesn't exist
  const branchesPath = getBranchesPath(projectDir);
  if (!fs.existsSync(branchesPath)) {
    saveBranches(projectDir, { activeBranch: 'main', branches: [] });
  }

  if (opts.list) {
    listBranches(projectDir);
    return;
  }

  if (opts.switch) {
    await switchBranch(projectDir, opts.switch);
    return;
  }

  if (!number) {
    console.error(chalk.red('\n  usage: snaprevert fork <number> [--name <name>]\n'));
    console.error(chalk.gray('  specify a snapshot number to fork from.\n'));
    process.exit(1);
  }

  await createFork(projectDir, number, opts.name);
};
