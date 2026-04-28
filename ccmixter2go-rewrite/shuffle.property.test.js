/**
 * Property-based tests for shuffle sequence.
 *
 * **Validates: Requirements 7.1**
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { createShuffleSequence } from './shuffle.js';

describe('shuffle property tests', () => {
  it('Property 2: Shuffle permutation — createShuffleSequence(n) produces a permutation of [0..n-1] (same length, same elements, no duplicates)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), (n) => {
        const seq = createShuffleSequence(n);

        // Same length
        assert.equal(seq.length, n, `Expected length ${n}, got ${seq.length}`);

        // Same elements, no duplicates: sorting should yield [0, 1, ..., n-1]
        const sorted = [...seq].sort((a, b) => a - b);
        const expected = Array.from({ length: n }, (_, i) => i);
        assert.deepStrictEqual(sorted, expected);
      }),
      { numRuns: 200 }
    );
  });
});
