const { computeDiff, applyDiff, reverseDiff } = require('../../../src/storage/differ');

describe('differ', () => {
  // 1. Compute diff of identical content - returns null
  test('computeDiff returns null for identical content', () => {
    const content = 'line one\nline two\nline three';
    const result = computeDiff(content, content);
    expect(result).toBeNull();
  });

  // 2. Compute diff with one line added
  test('computeDiff detects one line added', () => {
    const oldContent = 'line one\nline two\nline three';
    const newContent = 'line one\nline two\nline inserted\nline three';
    const diff = computeDiff(oldContent, newContent);

    expect(diff).not.toBeNull();
    expect(diff).toContain('+line inserted');
    // The added line should appear with a + prefix, no removed lines
    const lines = diff.split('\n');
    const addedLines = lines.filter(l => l.startsWith('+') && !l.startsWith('+++'));
    const removedLines = lines.filter(l => l.startsWith('-') && !l.startsWith('---'));
    expect(addedLines).toHaveLength(1);
    expect(removedLines).toHaveLength(0);
  });

  // 3. Compute diff with one line removed
  test('computeDiff detects one line removed', () => {
    const oldContent = 'line one\nline two\nline three';
    const newContent = 'line one\nline three';
    const diff = computeDiff(oldContent, newContent);

    expect(diff).not.toBeNull();
    expect(diff).toContain('-line two');
    const lines = diff.split('\n');
    const addedLines = lines.filter(l => l.startsWith('+') && !l.startsWith('+++'));
    const removedLines = lines.filter(l => l.startsWith('-') && !l.startsWith('---'));
    expect(removedLines).toHaveLength(1);
    expect(addedLines).toHaveLength(0);
  });

  // 4. Compute diff with one line modified
  test('computeDiff detects one line modified', () => {
    const oldContent = 'line one\nline two\nline three';
    const newContent = 'line one\nline TWO\nline three';
    const diff = computeDiff(oldContent, newContent);

    expect(diff).not.toBeNull();
    expect(diff).toContain('-line two');
    expect(diff).toContain('+line TWO');
  });

  // 5. Compute diff with multiple changes
  test('computeDiff detects multiple changes', () => {
    const oldContent = 'alpha\nbeta\ngamma\ndelta\nepsilon';
    const newContent = 'alpha\nBETA\ngamma\nzeta\nepsilon\nomega';
    const diff = computeDiff(oldContent, newContent);

    expect(diff).not.toBeNull();
    expect(diff).toContain('-beta');
    expect(diff).toContain('+BETA');
    expect(diff).toContain('-delta');
    expect(diff).toContain('+zeta');
    expect(diff).toContain('+omega');
  });

  // 6. Apply diff to original produces new content - roundtrip
  test('applyDiff roundtrip reproduces new content', () => {
    const oldContent = 'first\nsecond\nthird\nfourth';
    const newContent = 'first\nSECOND\nthird\ninserted\nfourth';
    const diff = computeDiff(oldContent, newContent);

    expect(diff).not.toBeNull();
    const result = applyDiff(oldContent, diff);
    expect(result).toBe(newContent);
  });

  // 7. Apply diff roundtrip for 10 random changes
  test('applyDiff roundtrip works for 10 random content pairs', () => {
    const bases = [
      { old: 'a\nb\nc', new: 'a\nX\nc' },
      { old: 'a\nb\nc', new: 'a\nb\nc\nd' },
      { old: 'a\nb\nc\nd', new: 'a\nc\nd' },
      { old: 'hello\nworld', new: 'hello\nbeautiful\nworld' },
      { old: 'one\ntwo\nthree', new: 'ONE\ntwo\nTHREE' },
      { old: 'x', new: 'x\ny\nz' },
      { old: 'a\nb\nc\nd\ne\nf', new: 'a\nB\nc\nD\ne\nF' },
      { old: 'only', new: 'completely\ndifferent\ncontent' },
      { old: 'keep\nremove\nkeep', new: 'keep\nkeep' },
      { old: 'start\nmiddle\nend', new: 'start\nmiddle\nnew line\nend' },
    ];

    for (const pair of bases) {
      const diff = computeDiff(pair.old, pair.new);
      expect(diff).not.toBeNull();
      const result = applyDiff(pair.old, diff);
      expect(result).toBe(pair.new);
    }
  });

  // 8. Reverse diff - reverseDiff applied to b produces a
  test('reverseDiff applied to newContent produces oldContent', () => {
    const oldContent = 'alpha\nbeta\ngamma';
    const newContent = 'alpha\nBETA\ngamma\ndelta';
    const diff = computeDiff(oldContent, newContent);

    expect(diff).not.toBeNull();
    const reversed = reverseDiff(diff);
    expect(reversed).not.toBeNull();
    const result = applyDiff(newContent, reversed);
    expect(result).toBe(oldContent);
  });

  // 9. Diff of empty file to content
  test('computeDiff from empty string to content', () => {
    const oldContent = '';
    const newContent = 'new line one\nnew line two';
    const diff = computeDiff(oldContent, newContent);

    expect(diff).not.toBeNull();
    expect(diff).toContain('+new line one');
    expect(diff).toContain('+new line two');

    const result = applyDiff(oldContent, diff);
    expect(result).toBe(newContent);
  });

  // 10. Diff of content to empty file
  test('computeDiff from content to empty string', () => {
    const oldContent = 'old line one\nold line two';
    const newContent = '';
    const diff = computeDiff(oldContent, newContent);

    expect(diff).not.toBeNull();
    expect(diff).toContain('-old line one');
    expect(diff).toContain('-old line two');

    const result = applyDiff(oldContent, diff);
    expect(result).toBe(newContent);
  });

  // 11. Diff of empty to empty
  test('computeDiff of empty to empty returns null', () => {
    const result = computeDiff('', '');
    expect(result).toBeNull();
  });

  // 12. Diff with unicode content (Japanese, emoji, accented)
  test('computeDiff handles unicode content', () => {
    const oldContent = 'Hello\n\u3053\u3093\u306B\u3061\u306F\ncaf\u00E9\n\uD83D\uDE00 smile';
    const newContent = 'Hello\n\u3055\u3088\u3046\u306A\u3089\ncaf\u00E9\n\uD83D\uDE00 smile\n\uD83C\uDF1F star';
    const diff = computeDiff(oldContent, newContent);

    expect(diff).not.toBeNull();
    expect(diff).toContain('-\u3053\u3093\u306B\u3061\u306F');
    expect(diff).toContain('+\u3055\u3088\u3046\u306A\u3089');
    expect(diff).toContain('+\uD83C\uDF1F star');

    const result = applyDiff(oldContent, diff);
    expect(result).toBe(newContent);
  });

  // 13. Diff with very long lines (10KB single line)
  test('computeDiff handles very long lines', () => {
    const longLine = 'A'.repeat(10 * 1024);
    const oldContent = 'before\n' + longLine + '\nafter';
    const newContent = 'before\n' + longLine + 'B' + '\nafter';
    const diff = computeDiff(oldContent, newContent);

    expect(diff).not.toBeNull();
    const result = applyDiff(oldContent, diff);
    expect(result).toBe(newContent);
  });

  // 14. Diff with Windows line endings (CRLF)
  test('computeDiff handles Windows CRLF line endings', () => {
    const oldContent = 'line one\r\nline two\r\nline three';
    const newContent = 'line one\r\nline CHANGED\r\nline three';
    const diff = computeDiff(oldContent, newContent);

    expect(diff).not.toBeNull();
    const result = applyDiff(oldContent, diff);
    expect(result).toBe(newContent);
  });

  // 15. Diff with mixed line endings
  test('computeDiff handles mixed line endings', () => {
    const oldContent = 'line one\nline two\r\nline three\rline four';
    const newContent = 'line one\nline TWO\r\nline three\rline four';
    const diff = computeDiff(oldContent, newContent);

    expect(diff).not.toBeNull();
    const result = applyDiff(oldContent, diff);
    expect(result).toBe(newContent);
  });

  // 16. Diff with trailing newline vs no trailing newline
  test('computeDiff distinguishes trailing newline vs no trailing newline', () => {
    const withTrailing = 'line one\nline two\n';
    const withoutTrailing = 'line one\nline two';
    const diff = computeDiff(withTrailing, withoutTrailing);

    expect(diff).not.toBeNull();
    const result = applyDiff(withTrailing, diff);
    expect(result).toBe(withoutTrailing);

    // Also test the reverse direction
    const diff2 = computeDiff(withoutTrailing, withTrailing);
    expect(diff2).not.toBeNull();
    const result2 = applyDiff(withoutTrailing, diff2);
    expect(result2).toBe(withTrailing);
  });

  // 17. Apply malformed diff - graceful error, not crash
  test('applyDiff handles malformed diff gracefully without crashing', () => {
    const baseContent = 'line one\nline two\nline three';

    // Completely garbage input
    expect(() => applyDiff(baseContent, 'not a real diff at all')).not.toThrow();

    // Missing hunk header
    expect(() => applyDiff(baseContent, '--- a\n+++ b\n+added line')).not.toThrow();

    // Malformed hunk header
    expect(() => applyDiff(baseContent, '--- a\n+++ b\n@@ broken @@\n+line')).not.toThrow();

    // Null/undefined diff returns base content unchanged
    expect(applyDiff(baseContent, null)).toBe(baseContent);
    expect(applyDiff(baseContent, undefined)).toBe(baseContent);
    expect(applyDiff(baseContent, '')).toBe(baseContent);
  });
});
