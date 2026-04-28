import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

// We need a fresh IDBFactory per test to avoid cached db state.
// db.js caches the db instance internally, so we re-import the module each time.

/** Helper: set up global IndexedDB polyfill with a fresh factory. */
function installFreshIndexedDB() {
  const factory = new IDBFactory();
  globalThis.indexedDB = factory;
  globalThis.IDBKeyRange = IDBKeyRange;
  return factory;
}

/**
 * Dynamically import db.js with a cache-busting query param so Node
 * gives us a fresh module (and therefore a fresh dbInstance = null).
 */
let importCounter = 0;
async function freshImport() {
  importCounter++;
  const mod = await import(`./db.js?v=${importCounter}`);
  return mod;
}

function makeSong(overrides = {}) {
  return {
    id: 1,
    title: 'Test Song',
    author: 'Test Author',
    url: 'https://example.com/song',
    downloadLink: 'https://example.com/song.mp3',
    licenceLink: 'https://example.com/license',
    tags: 'remix editorial_pick',
    file_name: 'test-song.mp3',
    size: 1024,
    license: 'by-nc',
    licenseName: 'CC BY-NC',
    isFavourite: false,
    wasFavourite: false,
    isPlaying: false,
    isPlayed: false,
    isSkipped: false,
    isEdPick: true,
    ...overrides,
  };
}

describe('db.js', () => {
  let db;

  beforeEach(() => {
    installFreshIndexedDB();
  });

  describe('openDB — store creation and upgrade', () => {
    it('creates the database with songs, edPicks, and favourites stores', async () => {
      db = await freshImport();
      const idb = await db.openDB();

      assert.ok(idb.objectStoreNames.contains('songs'));
      assert.ok(idb.objectStoreNames.contains('edPicks'));
      assert.ok(idb.objectStoreNames.contains('favourites'));
    });

    it('each store has id as keyPath and a filename index', async () => {
      db = await freshImport();
      const idb = await db.openDB();

      for (const name of ['songs', 'edPicks', 'favourites']) {
        const tx = idb.transaction(name, 'readonly');
        const store = tx.objectStore(name);
        assert.equal(store.keyPath, 'id');
        assert.ok(store.indexNames.contains('filename'));
      }
    });

    it('returns the same instance on subsequent calls', async () => {
      db = await freshImport();
      const first = await db.openDB();
      const second = await db.openDB();
      assert.equal(first, second);
    });
  });

  describe('insertSong / getSongById / deleteSong', () => {
    it('inserts and retrieves a song by id', async () => {
      db = await freshImport();
      await db.openDB();

      const song = makeSong({ id: 42 });
      await db.insertSong(song, 'songs');

      const result = await db.getSongById(42, 'songs');
      assert.deepStrictEqual(result, song);
    });

    it('returns null for a non-existent id', async () => {
      db = await freshImport();
      await db.openDB();

      const result = await db.getSongById(999, 'songs');
      assert.equal(result, null);
    });

    it('deletes a song by id', async () => {
      db = await freshImport();
      await db.openDB();

      const song = makeSong({ id: 10 });
      await db.insertSong(song, 'songs');
      await db.deleteSong(10, 'songs');

      const result = await db.getSongById(10, 'songs');
      assert.equal(result, null);
    });

    it('works across different stores independently', async () => {
      db = await freshImport();
      await db.openDB();

      const song = makeSong({ id: 5 });
      await db.insertSong(song, 'songs');
      await db.insertSong(song, 'edPicks');

      await db.deleteSong(5, 'songs');

      assert.equal(await db.getSongById(5, 'songs'), null);
      assert.deepStrictEqual(await db.getSongById(5, 'edPicks'), song);
    });
  });

  describe('duplicate insert is skipped', () => {
    it('does not overwrite an existing song with the same id', async () => {
      db = await freshImport();
      await db.openDB();

      const original = makeSong({ id: 7, title: 'Original' });
      const duplicate = makeSong({ id: 7, title: 'Duplicate' });

      await db.insertSong(original, 'songs');
      await db.insertSong(duplicate, 'songs');

      const result = await db.getSongById(7, 'songs');
      assert.equal(result.title, 'Original');
    });
  });

  describe('isSongInStore', () => {
    it('returns true when song exists', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 1 }), 'songs');
      assert.equal(await db.isSongInStore(1, 'songs'), true);
    });

    it('returns false when song does not exist', async () => {
      db = await freshImport();
      await db.openDB();

      assert.equal(await db.isSongInStore(999, 'songs'), false);
    });
  });

  describe('getHighestId', () => {
    it('returns the song with the highest id', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 10 }), 'songs');
      await db.insertSong(makeSong({ id: 50 }), 'songs');
      await db.insertSong(makeSong({ id: 30 }), 'songs');

      const result = await db.getHighestId('songs');
      assert.equal(result.id, 50);
    });

    it('returns null for an empty store', async () => {
      db = await freshImport();
      await db.openDB();

      const result = await db.getHighestId('songs');
      assert.equal(result, null);
    });
  });

  describe('getLowestUnplayedId', () => {
    it('returns the song with the lowest id that is not played and not skipped', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 1, isPlayed: true, isSkipped: false }), 'songs');
      await db.insertSong(makeSong({ id: 2, isPlayed: false, isSkipped: true }), 'songs');
      await db.insertSong(makeSong({ id: 3, isPlayed: false, isSkipped: false }), 'songs');
      await db.insertSong(makeSong({ id: 5, isPlayed: false, isSkipped: false }), 'songs');

      const result = await db.getLowestUnplayedId('songs');
      assert.equal(result.id, 3);
    });

    it('returns null when all songs are played or skipped', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 1, isPlayed: true }), 'songs');
      await db.insertSong(makeSong({ id: 2, isSkipped: true }), 'songs');

      const result = await db.getLowestUnplayedId('songs');
      assert.equal(result, null);
    });

    it('returns null for an empty store', async () => {
      db = await freshImport();
      await db.openDB();

      const result = await db.getLowestUnplayedId('songs');
      assert.equal(result, null);
    });
  });

  describe('getNextSong', () => {
    it('returns the next song after currentId that passes the filter', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 10 }), 'songs');
      await db.insertSong(makeSong({ id: 20, isSkipped: true }), 'songs');
      await db.insertSong(makeSong({ id: 30 }), 'songs');

      const result = await db.getNextSong(10, 'songs', (s) => !s.isSkipped);
      assert.equal(result.id, 30);
    });

    it('returns null when no song after currentId passes the filter', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 10 }), 'songs');
      await db.insertSong(makeSong({ id: 20, isSkipped: true }), 'songs');

      const result = await db.getNextSong(10, 'songs', (s) => !s.isSkipped);
      assert.equal(result, null);
    });

    it('returns null when currentId is the highest', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 10 }), 'songs');

      const result = await db.getNextSong(10, 'songs', () => true);
      assert.equal(result, null);
    });
  });

  describe('getPrevSong', () => {
    it('returns the previous song before currentId that passes the filter', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 10 }), 'songs');
      await db.insertSong(makeSong({ id: 20, isSkipped: true }), 'songs');
      await db.insertSong(makeSong({ id: 30 }), 'songs');

      const result = await db.getPrevSong(30, 'songs', (s) => !s.isSkipped);
      assert.equal(result.id, 10);
    });

    it('returns null when no song before currentId passes the filter', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 10, isSkipped: true }), 'songs');
      await db.insertSong(makeSong({ id: 20 }), 'songs');

      const result = await db.getPrevSong(20, 'songs', (s) => !s.isSkipped);
      assert.equal(result, null);
    });

    it('returns null when currentId is the lowest', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 10 }), 'songs');

      const result = await db.getPrevSong(10, 'songs', () => true);
      assert.equal(result, null);
    });
  });

  describe('getCount / getSongAtIndex / getAllIds', () => {
    it('getCount returns the number of records', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 1 }), 'songs');
      await db.insertSong(makeSong({ id: 2 }), 'songs');
      await db.insertSong(makeSong({ id: 3 }), 'songs');

      assert.equal(await db.getCount('songs'), 3);
    });

    it('getCount returns 0 for an empty store', async () => {
      db = await freshImport();
      await db.openDB();

      assert.equal(await db.getCount('songs'), 0);
    });

    it('getSongAtIndex returns the song at the given cursor position', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 10 }), 'songs');
      await db.insertSong(makeSong({ id: 20 }), 'songs');
      await db.insertSong(makeSong({ id: 30 }), 'songs');

      const first = await db.getSongAtIndex('songs', 0);
      assert.equal(first.id, 10);

      const second = await db.getSongAtIndex('songs', 1);
      assert.equal(second.id, 20);

      const third = await db.getSongAtIndex('songs', 2);
      assert.equal(third.id, 30);
    });

    it('getSongAtIndex returns null for out-of-range index', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 1 }), 'songs');

      const result = await db.getSongAtIndex('songs', 5);
      assert.equal(result, null);
    });

    it('getAllIds returns all keys in order', async () => {
      db = await freshImport();
      await db.openDB();

      await db.insertSong(makeSong({ id: 30 }), 'songs');
      await db.insertSong(makeSong({ id: 10 }), 'songs');
      await db.insertSong(makeSong({ id: 20 }), 'songs');

      const ids = await db.getAllIds('songs');
      assert.deepStrictEqual(ids, [10, 20, 30]);
    });

    it('getAllIds returns empty array for empty store', async () => {
      db = await freshImport();
      await db.openDB();

      const ids = await db.getAllIds('songs');
      assert.deepStrictEqual(ids, []);
    });
  });
});
