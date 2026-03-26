/**
 * Unified diff engine — compute, apply, and reverse diffs.
 * No external diff library. Custom implementation.
 */

function computeDiff(oldContent, newContent) {
  if (oldContent === newContent) {
    return null; // No changes
  }

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const hunks = computeHunks(oldLines, newLines);

  if (hunks.length === 0) {
    return null;
  }

  const diffLines = [];
  diffLines.push(`--- a`);
  diffLines.push(`+++ b`);

  for (const hunk of hunks) {
    diffLines.push(
      `@@ -${hunk.oldStart + 1},${hunk.oldCount} +${hunk.newStart + 1},${hunk.newCount} @@`
    );
    for (const line of hunk.lines) {
      diffLines.push(line);
    }
  }

  return diffLines.join('\n');
}

function applyDiff(baseContent, diffString) {
  if (!diffString) {
    return baseContent;
  }

  const diffLines = diffString.split('\n');
  const hunks = parseHunks(diffLines);
  const baseLines = splitLines(baseContent);
  const result = [];
  let baseIndex = 0;

  for (const hunk of hunks) {
    // Copy lines before this hunk
    while (baseIndex < hunk.oldStart) {
      result.push(baseLines[baseIndex]);
      baseIndex++;
    }

    // Apply hunk
    for (const line of hunk.lines) {
      const prefix = line[0];
      const content = line.substring(1);
      if (prefix === ' ') {
        result.push(content);
        baseIndex++;
      } else if (prefix === '+') {
        result.push(content);
      } else if (prefix === '-') {
        baseIndex++;
      }
    }
  }

  // Copy remaining lines
  while (baseIndex < baseLines.length) {
    result.push(baseLines[baseIndex]);
    baseIndex++;
  }

  return joinLines(result);
}

function reverseDiff(diffString) {
  if (!diffString) {
    return null;
  }

  const diffLines = diffString.split('\n');
  const result = [];

  for (const line of diffLines) {
    if (line.startsWith('--- a')) {
      result.push('+++ b');
    } else if (line.startsWith('+++ b')) {
      result.push('--- a');
    } else if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
      if (match) {
        result.push(`@@ -${match[3]},${match[4]} +${match[1]},${match[2]} @@`);
      } else {
        result.push(line);
      }
    } else if (line.startsWith('+')) {
      result.push('-' + line.substring(1));
    } else if (line.startsWith('-')) {
      result.push('+' + line.substring(1));
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

// --- Internal helpers ---

function splitLines(content) {
  if (content === '' || content === undefined || content === null) {
    return [];
  }
  return content.split('\n');
}

function joinLines(lines) {
  return lines.join('\n');
}

/**
 * Compute hunks using a simple LCS-based diff algorithm.
 */
function computeHunks(oldLines, newLines) {
  const edits = myersDiff(oldLines, newLines);
  if (edits.length === 0) return [];

  const hunks = [];
  let i = 0;

  while (i < edits.length) {
    // Find start of next change region with context
    const contextBefore = 3;
    const contextAfter = 3;

    const oldStart = Math.max(0, edits[i].oldIndex - contextBefore);
    const newStart = Math.max(0, edits[i].newIndex - contextBefore);

    // Collect edits that are close together into one hunk
    const hunkEdits = [];
    let lastOldEnd = -1;

    while (i < edits.length) {
      const edit = edits[i];

      // If this edit is far from the last one, start a new hunk
      if (hunkEdits.length > 0 && edit.oldIndex > lastOldEnd + 2 * contextAfter) {
        break;
      }

      hunkEdits.push(edit);

      if (edit.type === 'delete') {
        lastOldEnd = edit.oldIndex;
      } else if (edit.type === 'insert') {
        lastOldEnd = edit.oldIndex;
      }
      i++;
    }

    // Build hunk lines
    const lines = [];
    let oldIdx = oldStart;
    let editIdx = 0;

    // Sort edits by position
    hunkEdits.sort((a, b) => {
      if (a.oldIndex !== b.oldIndex) return a.oldIndex - b.oldIndex;
      if (a.type === 'delete' && b.type === 'insert') return -1;
      if (a.type === 'insert' && b.type === 'delete') return 1;
      return a.newIndex - b.newIndex;
    });

    editIdx = 0;
    oldIdx = oldStart;

    while (editIdx < hunkEdits.length) {
      const edit = hunkEdits[editIdx];

      // Add context lines before this edit
      while (oldIdx < edit.oldIndex && oldIdx < oldLines.length) {
        lines.push(' ' + oldLines[oldIdx]);
        oldIdx++;
      }

      if (edit.type === 'delete') {
        lines.push('-' + oldLines[edit.oldIndex]);
        oldIdx++;
        editIdx++;
        // Check for consecutive inserts at same position
        while (editIdx < hunkEdits.length &&
               hunkEdits[editIdx].type === 'insert' &&
               hunkEdits[editIdx].oldIndex === oldIdx) {
          lines.push('+' + newLines[hunkEdits[editIdx].newIndex]);
          editIdx++;
        }
      } else if (edit.type === 'insert') {
        lines.push('+' + newLines[edit.newIndex]);
        editIdx++;
      }
    }

    // Add context after
    const afterEnd = Math.min(oldLines.length, oldIdx + contextAfter);
    while (oldIdx < afterEnd) {
      lines.push(' ' + oldLines[oldIdx]);
      oldIdx++;
    }

    // Count old and new lines
    let oldCount = 0;
    let newCount = 0;
    for (const l of lines) {
      if (l[0] === ' ' || l[0] === '-') oldCount++;
      if (l[0] === ' ' || l[0] === '+') newCount++;
    }

    hunks.push({
      oldStart,
      oldCount,
      newStart,
      newCount,
      lines,
    });
  }

  return hunks;
}

/**
 * Simple Myers-like diff to find edit operations.
 * Returns array of { type: 'delete'|'insert', oldIndex, newIndex }
 */
function myersDiff(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;

  // Build LCS table
  const dp = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Trace back to find edits
  const edits = [];
  let i = 0, j = 0;

  while (i < n || j < m) {
    if (i < n && j < m && oldLines[i] === newLines[j]) {
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      edits.push({ type: 'insert', oldIndex: i, newIndex: j });
      j++;
    } else {
      edits.push({ type: 'delete', oldIndex: i, newIndex: j });
      i++;
    }
  }

  return edits;
}

/**
 * Parse hunks from unified diff lines.
 */
function parseHunks(diffLines) {
  const hunks = [];
  let currentHunk = null;

  for (const line of diffLines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
      if (match) {
        currentHunk = {
          oldStart: parseInt(match[1], 10) - 1,
          oldCount: parseInt(match[2], 10),
          newStart: parseInt(match[3], 10) - 1,
          newCount: parseInt(match[4], 10),
          lines: [],
        };
        hunks.push(currentHunk);
      }
    } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      currentHunk.lines.push(line);
    }
  }

  return hunks;
}

module.exports = { computeDiff, applyDiff, reverseDiff };
