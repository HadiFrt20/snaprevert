const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  debounce_ms: 3000,
  retention_days: 30,
  max_snapshots: 500,
  max_file_size_kb: 1024,
  auto_label: true,
  ignore_patterns: [],
};

const CONFIG_VALIDATORS = {
  debounce_ms: (v) => typeof v === 'number' && v >= 100 && v <= 60000,
  retention_days: (v) => typeof v === 'number' && v >= 1 && v <= 365,
  max_snapshots: (v) => typeof v === 'number' && v >= 10 && v <= 10000,
  max_file_size_kb: (v) => typeof v === 'number' && v >= 1 && v <= 102400,
  auto_label: (v) => typeof v === 'boolean',
  ignore_patterns: (v) => Array.isArray(v),
};

function getConfigPath(projectDir) {
  return path.join(projectDir, '.snaprevert', 'config.json');
}

function loadConfig(projectDir) {
  const configPath = getConfigPath(projectDir);
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // Corrupt config — fall through to defaults
  }
  return { ...DEFAULTS };
}

function saveConfig(projectDir, config) {
  const configPath = getConfigPath(projectDir);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

function updateConfig(projectDir, key, value) {
  if (!(key in DEFAULTS)) {
    throw new Error(`Unknown config key: ${key}`);
  }

  // Coerce types
  let coerced = value;
  if (typeof DEFAULTS[key] === 'number') {
    coerced = Number(value);
    if (isNaN(coerced)) {
      throw new Error(`Invalid value for ${key}: must be a number`);
    }
  } else if (typeof DEFAULTS[key] === 'boolean') {
    if (value === 'true') coerced = true;
    else if (value === 'false') coerced = false;
    else throw new Error(`Invalid value for ${key}: must be true or false`);
  }

  if (!CONFIG_VALIDATORS[key](coerced)) {
    throw new Error(`Invalid value for ${key}: ${value}`);
  }

  const config = loadConfig(projectDir);
  config[key] = coerced;
  saveConfig(projectDir, config);
  return config;
}

function resetConfig(projectDir) {
  saveConfig(projectDir, { ...DEFAULTS });
  return { ...DEFAULTS };
}

module.exports = { DEFAULTS, loadConfig, saveConfig, updateConfig, resetConfig, getConfigPath };
