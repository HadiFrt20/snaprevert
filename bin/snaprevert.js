#!/usr/bin/env node

const { program } = require('commander');
const pkg = require('../package.json');

program
  .name('snaprevert')
  .description('The undo button for AI-assisted coding')
  .version(pkg.version);

program
  .command('watch')
  .description('Start watching for file changes and auto-snapshot')
  .action((opts) => {
    const watch = require('../src/commands/watch');
    watch(opts);
  });

program
  .command('snap')
  .description('Create a manual snapshot')
  .option('-l, --label <label>', 'Label for the snapshot')
  .action((opts) => {
    const snap = require('../src/commands/snap');
    snap(opts);
  });

program
  .command('list')
  .description('List all snapshots')
  .option('-n, --limit <n>', 'Show only last N snapshots', '20')
  .option('-a, --all', 'Show all snapshots')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    const list = require('../src/commands/list');
    list(opts);
  });

program
  .command('diff <number>')
  .description('Show what changed in a snapshot')
  .option('--files-only', 'Show only file list, no inline diffs')
  .option('--full', 'Show full content for added files')
  .option('--json', 'Output as JSON')
  .action((number, opts) => {
    const diff = require('../src/commands/diff');
    diff(number, opts);
  });

program
  .command('back <number>')
  .description('Rollback to before a snapshot')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--dry', 'Show what would change without doing it')
  .action((number, opts) => {
    const back = require('../src/commands/back');
    back(number, opts);
  });

program
  .command('restore <number>')
  .description('Re-apply a rolled-back snapshot')
  .action((number, opts) => {
    const restore = require('../src/commands/restore');
    restore(number, opts);
  });

program
  .command('config [key] [value]')
  .description('Show or set configuration')
  .option('--reset', 'Reset to defaults')
  .action((key, value, opts) => {
    const config = require('../src/commands/config');
    config(key, value, opts);
  });

program
  .command('status')
  .description('Show current state overview')
  .action((opts) => {
    const status = require('../src/commands/status');
    status(opts);
  });

program
  .command('cleanup')
  .description('Prune old snapshots')
  .option('--older <duration>', 'Prune older than duration (e.g., 7d, 24h)')
  .option('--keep <n>', 'Keep only last N snapshots')
  .option('--dry', 'Show what would be pruned without pruning')
  .action((opts) => {
    const cleanup = require('../src/commands/cleanup');
    cleanup(opts);
  });

program.parse();
