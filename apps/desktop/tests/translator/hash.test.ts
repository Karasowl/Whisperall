import { describe, it, expect } from 'vitest';
import { hammingDistance, normalizeOcrText } from '../../src/translator/hash';

describe('hammingDistance', () => {
  it('returns 0 for equal hashes', () => {
    expect(hammingDistance(0n, 0n)).toBe(0);
    expect(hammingDistance(0xfffffffffffffffen, 0xfffffffffffffffen)).toBe(0);
  });

  it('counts differing bits', () => {
    expect(hammingDistance(0b0000n, 0b0001n)).toBe(1);
    expect(hammingDistance(0b0000n, 0b1111n)).toBe(4);
    expect(hammingDistance(0xffn, 0x00n)).toBe(8);
  });

  it('is symmetric', () => {
    const a = 0x1234567890abcdefn;
    const b = 0xfedcba9876543210n;
    expect(hammingDistance(a, b)).toBe(hammingDistance(b, a));
  });

  it('caps at 64 for max-different 64-bit values', () => {
    expect(hammingDistance(0xffffffffffffffffn, 0x0000000000000000n)).toBe(64);
  });
});

describe('normalizeOcrText', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeOcrText('  Hello   World  ')).toBe('hello world');
  });

  it('normalizes line breaks and tabs', () => {
    expect(normalizeOcrText('foo\n\tbar\n  baz')).toBe('foo bar baz');
  });

  it('preserves punctuation (semantic-changing)', () => {
    expect(normalizeOcrText("Let's eat, grandma.")).toBe("let's eat, grandma.");
  });

  it('returns empty for whitespace-only input', () => {
    expect(normalizeOcrText('   \n  \t  ')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeOcrText('  Foo  BAR  ');
    const twice = normalizeOcrText(once);
    expect(twice).toBe(once);
  });
});
