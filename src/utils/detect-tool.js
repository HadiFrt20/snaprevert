/**
 * Detect which AI coding tool is likely running.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getProcessList() {
  try {
    return execSync('ps aux', { encoding: 'utf-8', timeout: 5000 });
  } catch {
    return '';
  }
}

function detectTool(projectDir) {
  const processList = getProcessList();

  // Claude Code: process containing "claude" or env var CLAUDE_CODE
  if (process.env.CLAUDE_CODE || /\bclaude\b/i.test(processList)) {
    return 'claude';
  }

  // Cursor: process "Cursor" or .cursor/ directory
  if (/\bCursor\b/.test(processList) || fs.existsSync(path.join(projectDir, '.cursor'))) {
    return 'cursor';
  }

  // Copilot: .github/copilot or "GitHub Copilot" in process list
  if (
    fs.existsSync(path.join(projectDir, '.github', 'copilot')) ||
    /GitHub Copilot/i.test(processList)
  ) {
    return 'copilot';
  }

  // Aider: process containing "aider"
  if (/\baider\b/i.test(processList)) {
    return 'aider';
  }

  // Windsurf: process "Windsurf" or .windsurf/ directory
  if (/\bWindsurf\b/.test(processList) || fs.existsSync(path.join(projectDir, '.windsurf'))) {
    return 'windsurf';
  }

  // Codex: process containing "codex"
  if (/\bcodex\b/i.test(processList)) {
    return 'codex';
  }

  return null;
}

module.exports = { detectTool };
