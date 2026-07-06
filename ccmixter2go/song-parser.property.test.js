/**
 * Property-based tests for song-parser round-trip consistency.
 *
 * **Validates: Requirements 19.4**
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { parseSongFromAPI, songToAPIFormat } from './song-parser.js';

/**
 * Arbitrary for a license slug that round-trips through extractLicenseSlug.
 * The slug must not contain digits at the end after a dash (those get stripped
 * as version numbers), and must not contain a dash followed by only digits.
 */
const licenseSlugArb = fc.constantFrom(
  'by', 'by-sa', 'by-nc', 'by-nd', 'by-nc-sa', 'by-nc-nd',
  'sampling_plus', 'nc-sampling_plus'
);

/**
 * Arbitrary for a valid ccMixter API response object that will produce
 * a non-null Song from parseSongFromAPI.
 */
const rawSongArb = fc.record({
  upload_id: fc.integer({ min: 1, max: 999999 }),
  upload_name: fc.string({ minLength: 1, maxLength: 100 }),
  user_real_name: fc.string({ minLength: 1, maxLength: 100 }),
  file_page_url: fc.webUrl(),
  license_url: fc.webUrl(),
  upload_tags: fc.array(
    fc.stringMatching(/^[a-z_]{1,20}$/),
    { minLength: 0, maxLength: 5 }
  ).map(tags => tags.join(' ')),
  license_logo_url: licenseSlugArb.map(
    slug => `http://i.creativecommons.org/l/cc-${slug}-3.png`
  ),
  license_name: fc.string({ minLength: 1, maxLength: 80 }),
  files: fc.tuple(
    fc.record({
      download_url: fc.webUrl(),
      file_name: fc.stringMatching(/^[a-zA-Z0-9_-]{1,30}\.mp3$/),
      file_rawsize: fc.integer({ min: 1, max: 100_000_000 }),
    })
  ).map(([mp3]) => [
    {
      file_format_info: { 'format-name': 'audio-mp3-mp3' },
      download_url: mp3.download_url,
      file_name: mp3.file_name,
      file_rawsize: mp3.file_rawsize,
    },
  ]),
});

describe('song-parser property tests', () => {
  it('Property 1: Round-trip consistency — parseSongFromAPI(songToAPIFormat(parseSongFromAPI(raw))) equals parseSongFromAPI(raw)', () => {
    fc.assert(
      fc.property(rawSongArb, (raw) => {
        const song1 = parseSongFromAPI(raw);
        // song1 should be non-null given our generator always includes an mp3 file
        assert.notEqual(song1, null);

        const serialized = songToAPIFormat(song1);
        const song2 = parseSongFromAPI(serialized);

        assert.deepStrictEqual(song2, song1);
      }),
      { numRuns: 200 }
    );
  });
});
