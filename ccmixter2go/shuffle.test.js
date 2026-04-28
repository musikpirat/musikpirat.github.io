import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createShuffleSequence, nextFromSequence } from './shuffle.js';

describe('createShuffleSequence', () => {
  it('returns an array of the requested length', () => {
    const seq = createShuffleSequence(10);
    assert.equal(seq.length, 10);
  });

  it('contains every index from 0 to count-1 exactly once', () => {
    const seq = createShuffleSequence(20);
    const sorted = [...seq].sort((a, b) => a - b);
    assert.deepStrictEqual(sorted, Array.from({ length: 20 }, (_, i) => i));
  });

  it('returns an empty array for count 0', () => {
    assert.deepStrictEqual(createShuffleSequence(0), []);
  });

  it('returns [0] for count 1', () => {
    assert.deepStrictEqual(createShuffleSequence(1), [0]);
  });
});

describe('nextFromSequence', () => {
  it('returns the last element as index and the rest as remaining', () => {
    const result = nextFromSequence([3, 1, 4, 2]);
    assert.equal(result.index, 2);
    assert.deepStrictEqual(result.remaining, [3, 1, 4]);
  });

  it('works for a single-element sequence', () => {
    const result = nextFromSequence([5]);
    assert.equal(result.index, 5);
    assert.deepStrictEqual(result.remaining, []);
  });

  it('does not mutate the original sequence', () => {
    const original = [3, 1, 4, 2];
    const copy = [...original];
    nextFromSequence(original);
    assert.deepStrictEqual(original, copy);
  });
});
