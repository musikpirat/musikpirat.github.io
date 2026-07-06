import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSongFromAPI, songToAPIFormat } from './song-parser.js';

/** Helper: minimal valid API response with an mp3 file */
function makeRawSong(overrides = {}) {
  return {
    upload_id: 42,
    upload_name: 'Test Song',
    user_real_name: 'Test Author',
    file_page_url: 'http://ccmixter.org/files/author/42',
    license_url: 'http://creativecommons.org/licenses/by-nc/3.0/',
    upload_tags: 'remix chill',
    license_logo_url: 'http://i.creativecommons.org/l/cc-by-nc-3.png',
    license_name: 'Attribution Noncommercial (3.0)',
    files: [
      {
        file_format_info: { 'format-name': 'audio-mp3-mp3' },
        download_url: 'http://ccmixter.org/content/author/song.mp3',
        file_name: 'song.mp3',
        file_rawsize: 5000000,
      },
    ],
    ...overrides,
  };
}

describe('parseSongFromAPI', () => {
  it('maps all API fields to Song fields', () => {
    const raw = makeRawSong();
    const song = parseSongFromAPI(raw);

    assert.equal(song.id, 42);
    assert.equal(song.title, 'Test Song');
    assert.equal(song.author, 'Test Author');
    assert.equal(song.url, 'http://ccmixter.org/files/author/42');
    assert.equal(song.licenceLink, 'http://creativecommons.org/licenses/by-nc/3.0/');
    assert.equal(song.tags, 'remix chill');
    assert.equal(song.downloadLink, 'http://ccmixter.org/content/author/song.mp3');
    assert.equal(song.file_name, 'song.mp3');
    assert.equal(song.size, 5000000);
    assert.equal(song.licenseName, 'Attribution Noncommercial (3.0)');
  });

  it('extracts license slug "by-nc" from logo URL', () => {
    const song = parseSongFromAPI(makeRawSong({
      license_logo_url: 'http://i.creativecommons.org/l/cc-by-nc-3.png',
    }));
    assert.equal(song.license, 'by-nc');
  });

  it('extracts license slug "by-sa" from logo URL', () => {
    const song = parseSongFromAPI(makeRawSong({
      license_logo_url: 'http://i.creativecommons.org/l/cc-by-sa-3.png',
    }));
    assert.equal(song.license, 'by-sa');
  });

  it('extracts license slug "by" from logo URL', () => {
    const song = parseSongFromAPI(makeRawSong({
      license_logo_url: 'http://i.creativecommons.org/l/cc-by-3.png',
    }));
    assert.equal(song.license, 'by');
  });

  it('extracts license slug "sampling_plus" from logo URL', () => {
    const song = parseSongFromAPI(makeRawSong({
      license_logo_url: 'http://i.creativecommons.org/l/cc-sampling_plus-3.png',
    }));
    assert.equal(song.license, 'sampling_plus');
  });

  it('returns null when no audio-mp3-mp3 file is present', () => {
    const raw = makeRawSong({
      files: [
        {
          file_format_info: { 'format-name': 'audio-ogg-ogg' },
          download_url: 'http://example.com/song.ogg',
          file_name: 'song.ogg',
          file_rawsize: 3000000,
        },
      ],
    });
    assert.equal(parseSongFromAPI(raw), null);
  });

  it('returns null when files array is empty', () => {
    assert.equal(parseSongFromAPI(makeRawSong({ files: [] })), null);
  });

  it('returns null for null/undefined input', () => {
    assert.equal(parseSongFromAPI(null), null);
    assert.equal(parseSongFromAPI(undefined), null);
  });

  it('sets default boolean flags', () => {
    const song = parseSongFromAPI(makeRawSong());
    assert.equal(song.isFavourite, false);
    assert.equal(song.wasFavourite, false);
    assert.equal(song.isPlaying, false);
    assert.equal(song.isPlayed, false);
    assert.equal(song.isSkipped, false);
  });

  it('derives isEdPick = true when tags include editorial_pick', () => {
    const song = parseSongFromAPI(makeRawSong({
      upload_tags: 'remix editorial_pick chill',
    }));
    assert.equal(song.isEdPick, true);
  });

  it('derives isEdPick = false when tags do not include editorial_pick', () => {
    const song = parseSongFromAPI(makeRawSong({
      upload_tags: 'remix chill',
    }));
    assert.equal(song.isEdPick, false);
  });

  it('picks the first audio-mp3-mp3 file when multiple files exist', () => {
    const raw = makeRawSong({
      files: [
        {
          file_format_info: { 'format-name': 'audio-ogg-ogg' },
          download_url: 'http://example.com/song.ogg',
          file_name: 'song.ogg',
          file_rawsize: 3000000,
        },
        {
          file_format_info: { 'format-name': 'audio-mp3-mp3' },
          download_url: 'http://example.com/first.mp3',
          file_name: 'first.mp3',
          file_rawsize: 5000000,
        },
        {
          file_format_info: { 'format-name': 'audio-mp3-mp3' },
          download_url: 'http://example.com/second.mp3',
          file_name: 'second.mp3',
          file_rawsize: 6000000,
        },
      ],
    });
    const song = parseSongFromAPI(raw);
    assert.equal(song.downloadLink, 'http://example.com/first.mp3');
    assert.equal(song.file_name, 'first.mp3');
  });
});

describe('songToAPIFormat', () => {
  it('serializes a Song back to API-compatible format', () => {
    const song = {
      id: 42,
      title: 'Test Song',
      author: 'Test Author',
      url: 'http://ccmixter.org/files/author/42',
      downloadLink: 'http://ccmixter.org/content/author/song.mp3',
      licenceLink: 'http://creativecommons.org/licenses/by-nc/3.0/',
      tags: 'remix chill',
      file_name: 'song.mp3',
      size: 5000000,
      license: 'by-nc',
      licenseName: 'Attribution Noncommercial (3.0)',
      isFavourite: false,
      wasFavourite: false,
      isPlaying: false,
      isPlayed: false,
      isSkipped: false,
      isEdPick: false,
    };

    const raw = songToAPIFormat(song);
    assert.equal(raw.upload_id, 42);
    assert.equal(raw.upload_name, 'Test Song');
    assert.equal(raw.user_real_name, 'Test Author');
    assert.equal(raw.file_page_url, 'http://ccmixter.org/files/author/42');
    assert.equal(raw.license_url, 'http://creativecommons.org/licenses/by-nc/3.0/');
    assert.equal(raw.upload_tags, 'remix chill');
    assert.equal(raw.license_name, 'Attribution Noncommercial (3.0)');
    assert.equal(raw.files.length, 1);
    assert.equal(raw.files[0].file_format_info['format-name'], 'audio-mp3-mp3');
    assert.equal(raw.files[0].download_url, 'http://ccmixter.org/content/author/song.mp3');
    assert.equal(raw.files[0].file_name, 'song.mp3');
    assert.equal(raw.files[0].file_rawsize, 5000000);
  });

  it('round-trips: parse → serialize → parse produces equivalent Song', () => {
    const raw = makeRawSong();
    const song1 = parseSongFromAPI(raw);
    const serialized = songToAPIFormat(song1);
    const song2 = parseSongFromAPI(serialized);
    assert.deepStrictEqual(song2, song1);
  });
});
