/**
 * Builds ignore patterns from defaults + .gitignore + .snaprevertignore
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_IGNORES = [
  'node_modules',
  '.git',
  '.snaprevert',
  '__pycache__',
  '.DS_Store',
  '*.pyc',
  'dist',
  'build',
  '.next',
  '.env',
  '.env.*',
  'coverage',
  '.nyc_output',
  '*.swp',
  '*.swo',
  '*~',
];

function buildIgnoreFilter(projectDir, extraPatterns) {
  const patterns = [...DEFAULT_IGNORES];

  // Parse .gitignore
  const gitignorePath = path.join(projectDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const lines = parseIgnoreFile(gitignorePath);
    patterns.push(...lines);
  }

  // Parse .snaprevertignore
  const snapignorePath = path.join(projectDir, '.snaprevertignore');
  if (fs.existsSync(snapignorePath)) {
    const lines = parseIgnoreFile(snapignorePath);
    patterns.push(...lines);
  }

  // Extra from config
  if (extraPatterns && extraPatterns.length > 0) {
    patterns.push(...extraPatterns);
  }

  // Separate negation patterns
  const negations = patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1));
  const ignores = patterns.filter((p) => !p.startsWith('!'));

  return function shouldWatch(filePath) {
    // Normalize to relative path
    const rel = path.relative(projectDir, filePath).replace(/\\/g, '/');

    // Check negations first (they override ignores)
    for (const neg of negations) {
      if (matchPattern(rel, neg)) {
        return true;
      }
    }

    // Check ignores
    for (const pattern of ignores) {
      if (matchPattern(rel, pattern)) {
        return false;
      }
    }

    return true;
  };
}

function parseIgnoreFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function matchPattern(filePath, pattern) {
  // Direct name match (matches at any depth)
  const basename = path.basename(filePath);
  const parts = filePath.split('/');

  // Remove trailing slash for directory patterns
  const cleanPattern = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;

  // Simple glob matching
  if (cleanPattern.includes('/')) {
    // Path pattern — match from root
    return globMatch(filePath, cleanPattern);
  }

  // Name pattern — match basename OR any path segment
  for (const part of parts) {
    if (globMatch(part, cleanPattern)) {
      return true;
    }
  }

  return false;
}

function globMatch(str, pattern) {
  // Convert glob to regex
  let regex = '^';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches any path
        regex += '.*';
        i += 2;
        if (pattern[i] === '/') i++; // skip trailing /
        continue;
      }
      regex += '[^/]*';
    } else if (ch === '?') {
      regex += '[^/]';
    } else if (ch === '.') {
      regex += '\\.';
    } else if (ch === '(' || ch === ')' || ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === '^' || ch === '$' || ch === '+' || ch === '|') {
      regex += '\\' + ch;
    } else {
      regex += ch;
    }
    i++;
  }

  regex += '$';

  try {
    return new RegExp(regex).test(str);
  } catch {
    return false;
  }
}

module.exports = { buildIgnoreFilter, DEFAULT_IGNORES, parseIgnoreFile, matchPattern };
