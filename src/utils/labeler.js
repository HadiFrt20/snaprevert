const path = require('path');

function generateLabel(changes, tool) {
  if (!changes || changes.length === 0) {
    return 'empty snapshot';
  }

  const added = changes.filter((c) => c.type === 'added');
  const modified = changes.filter((c) => c.type === 'modified');
  const deleted = changes.filter((c) => c.type === 'deleted');

  const totalFiles = changes.length;

  // If many files, summarize by directory
  if (totalFiles > 5) {
    const dirs = {};
    for (const c of changes) {
      const dir = path.dirname(c.filePath);
      dirs[dir] = (dirs[dir] || 0) + 1;
    }
    const topDir = Object.entries(dirs).sort((a, b) => b[1] - a[1])[0];
    const parts = [];
    if (added.length > 0) parts.push(`added ${added.length}`);
    if (modified.length > 0) parts.push(`modified ${modified.length}`);
    if (deleted.length > 0) parts.push(`deleted ${deleted.length}`);
    const summary = `${parts.join(', ')} files in ${topDir[0]}/`;
    if (tool) {
      return `${tool}: ${summary}`;
    }
    return summary;
  }

  // Only deletions
  if (added.length === 0 && modified.length === 0) {
    const names = deleted.map((c) => path.basename(c.filePath));
    const delLabel = `deleted ${names.join(', ')}`;
    if (tool) {
      return `${tool}: ${delLabel}`;
    }
    return delLabel;
  }

  const parts = [];

  if (modified.length > 0) {
    const names = modified.map((c) => path.basename(c.filePath));
    parts.push(`modified ${names.join(', ')}`);
  }
  if (added.length > 0) {
    const names = added.map((c) => path.basename(c.filePath));
    parts.push(`added ${names.join(', ')}`);
  }
  if (deleted.length > 0) {
    const names = deleted.map((c) => path.basename(c.filePath));
    parts.push(`deleted ${names.join(', ')}`);
  }

  const label = parts.join(', ');
  if (tool) {
    return `${tool}: ${label}`;
  }
  return label;
}

module.exports = { generateLabel };
