/**
 * Shuffle module — Fisher-Yates shuffle sequence for favourites playback.
 */

/**
 * Returns a permutation of [0..count-1] using the Fisher-Yates shuffle.
 * @param {number} count
 * @returns {number[]}
 */
export function createShuffleSequence(count) {
  const arr = Array.from({ length: count }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Pops the last element from the sequence.
 * @param {number[]} sequence
 * @returns {{ index: number, remaining: number[] }}
 */
export function nextFromSequence(sequence) {
  const remaining = sequence.slice(0, -1);
  const index = sequence[sequence.length - 1];
  return { index, remaining };
}
