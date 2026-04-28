/**
 * Integration tests — end-to-end flows through the data layer.
 *
 * Tests the startup, navigation, and favourite toggle flows using
 * real IndexedDB (via fake-indexeddb) and the actual song-parser/db modules.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { parseSongFromAPI } from './song-parser.js';

let importCounter = 0;

function installFreshIndexedDB() {
  const factory = new IDBFactory();
  globalThis.indexedDB = factory;
  globalThis.IDBKeyRange = IDBKeyRange;
}

async function freshImport() {
  importCounter++;
  return await import(`./db.js?v=int${importCounter}`);
}

function makeRawSong(id, { edPick = false } = {}) {
  const tags = edPick ? 'remix editorial_pick' : 'remix';
  return {
    upload_id: id,
    upload_name: 'Song ' + id,
    user_real_name: 'Artist ' + id,
    file_page_url: 'http://ccmixter.org/files/artist/' + id,
    license_url: 'http://creativecommons.org/licenses/by/3.0/',
    upload_tags: tags,
    license_logo_url: 'http://i.creativecommons.org/l/cc-by-3.png',
    license_name: 'Attribution (3.0)',
    files: [{
      file_format_info: { 'format-name': 'audio-mp3-mp3' },
      download_url: 'http://ccmixter.org/content/artist/song' + id + '.mp3',
      file_name: 'song' + id + '.mp3',
      file_rawsize: 5000000,
    }],
  };
}

describe('Integration: Startup flow', () => {
  let db;

  beforeEach(() => { installFreshIndexedDB(); });

  it('DB open → parse songs → store → retrieve highest edPick', async () => {
    const { openDB, insertSong, getHighestId } = await freshImport();
    await openDB();

    const rawSongs = [makeRawSong(100, { edPick: true }), makeRawSong(101), makeRawSong(102, { edPick: true })];
    const parsed = rawSongs.map(parseSongFromAPI).filter(Boolean);
    assert.equal(parsed.length, 3);

    for (const song of parsed) {
      await insertSong(song, 'songs');
      if (song.isEdPick) await insertSong(song, 'edPicks');
    }

    const highest = await getHighestId('edPicks');
    assert.ok(highest);
    assert.equal(highest.id, 102);
    assert.equal(highest.isEdPick, true);
  });
});

describe('Integration: Swipe navigation flow', () => {
  beforeEach(() => { installFreshIndexedDB(); });

  it('swipe left → getNextSong → returns newer song', async () => {
    const { openDB, insertSong, getNextSong } = await freshImport();
    await openDB();

    const songs = [makeRawSong(200), makeRawSong(201), makeRawSong(202)].map(parseSongFromAPI);
    for (const s of songs) await insertSong(s, 'songs');

    const next = await getNextSong(200, 'songs', (s) => !s.isSkipped && !s.isPlayed);
    assert.ok(next);
    assert.equal(next.id, 201);

    const next2 = await getNextSong(201, 'songs', (s) => !s.isSkipped && !s.isPlayed);
    assert.equal(next2.id, 202);

    const next3 = await getNextSong(202, 'songs', (s) => !s.isSkipped && !s.isPlayed);
    assert.equal(next3, null);
  });

  it('swipe right → getPrevSong → returns older song', async () => {
    const { openDB, insertSong, getPrevSong } = await freshImport();
    await openDB();

    const songs = [makeRawSong(300), makeRawSong(301), makeRawSong(302)].map(parseSongFromAPI);
    for (const s of songs) await insertSong(s, 'songs');

    const prev = await getPrevSong(302, 'songs', () => true);
    assert.ok(prev);
    assert.equal(prev.id, 301);
  });

  it('skipped songs are filtered out during navigation', async () => {
    const { openDB, insertSong, getNextSong } = await freshImport();
    await openDB();

    const songs = [makeRawSong(400), makeRawSong(401), makeRawSong(402)].map(parseSongFromAPI);
    songs[1].isSkipped = true;
    for (const s of songs) await insertSong(s, 'songs');

    const next = await getNextSong(400, 'songs', (s) => !s.isSkipped && !s.isPlayed);
    assert.ok(next);
    assert.equal(next.id, 402);
  });
});

describe('Integration: Favourite toggle flow', () => {
  beforeEach(() => { installFreshIndexedDB(); });

  it('star → insert into favourites → unstar → delete from favourites', async () => {
    const { openDB, insertSong, deleteSong, getSongById, isSongInStore } = await freshImport();
    await openDB();

    const song = parseSongFromAPI(makeRawSong(500));
    await insertSong(song, 'songs');

    song.isFavourite = true;
    await insertSong(song, 'favourites');
    assert.equal(await isSongInStore(500, 'favourites'), true);

    await deleteSong(500, 'favourites');
    assert.equal(await isSongInStore(500, 'favourites'), false);

    const fromSongs = await getSongById(500, 'songs');
    assert.ok(fromSongs);
  });
});
