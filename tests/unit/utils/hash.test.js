const { hash, shortId } = require('../../../src/utils/hash');

describe('hash', () => {
  test('deterministic: same content same hash', () => {
    const content = 'hello world';
    const h1 = hash(content);
    const h2 = hash(content);
    expect(h1).toBe(h2);

    // Also verify with different invocations
    const h3 = hash('hello world');
    expect(h1).toBe(h3);
  });

  test('different content different hash', () => {
    const h1 = hash('content A');
    const h2 = hash('content B');
    expect(h1).not.toBe(h2);

    // Even small changes produce different hashes
    const h3 = hash('abc');
    const h4 = hash('abd');
    expect(h3).not.toBe(h4);
  });

  test('format: hex string', () => {
    const h = hash('test content');
    // SHA-256 produces a 64-character hex string
    expect(h).toMatch(/^[0-9a-f]{64}$/);

    // shortId produces an 8-character hex string (4 random bytes)
    const id = shortId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });
});
