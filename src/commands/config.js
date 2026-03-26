const chalk = require('chalk');
const { isInitialized } = require('../storage/store');
const { loadConfig, updateConfig, resetConfig, DEFAULTS } = require('../utils/config');

module.exports = function config(key, value, opts) {
  const projectDir = process.cwd();

  if (!isInitialized(projectDir)) {
    console.error(chalk.red('\n  no .snaprevert/ found. run snaprevert watch to start.\n'));
    process.exit(1);
  }

  if (opts.reset) {
    resetConfig(projectDir);
    console.log(chalk.green('\n  ✓ config reset to defaults.\n'));
    return;
  }

  if (!key) {
    // Show all config
    const cfg = loadConfig(projectDir);
    console.log(chalk.bold('\n  snaprevert config\n'));
    for (const [k, v] of Object.entries(cfg)) {
      const isDefault = JSON.stringify(v) === JSON.stringify(DEFAULTS[k]);
      const marker = isDefault ? chalk.gray(' (default)') : chalk.yellow(' (custom)');
      console.log(`  ${chalk.white(k.padEnd(20))} ${JSON.stringify(v)}${marker}`);
    }
    console.log('');
    return;
  }

  if (!value) {
    // Show single key
    const cfg = loadConfig(projectDir);
    if (key in cfg) {
      console.log(`\n  ${key} = ${JSON.stringify(cfg[key])}\n`);
    } else {
      console.error(chalk.red(`\n  unknown config key: ${key}\n`));
      process.exit(1);
    }
    return;
  }

  try {
    updateConfig(projectDir, key, value);
    console.log(chalk.green(`\n  ✓ ${key} = ${value}\n`));
  } catch (err) {
    console.error(chalk.red(`\n  ${err.message}\n`));
    process.exit(1);
  }
};
