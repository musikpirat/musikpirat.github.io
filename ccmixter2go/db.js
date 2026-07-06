/**
 * IndexedDB database module — all local storage operations for ccMixter2go.
 *
 * Database: 'ccmixter2go', version 4
 * Stores: songs, edPicks, favourites — keyed on `id`, with `filename` index on `file_name`.
 *
 * @module db
 */

const DB_NAME = 'ccmixter2go';
const DB_VERSION = 4;
const STORE_NAMES = ['songs', 'edPicks', 'favourites'];

/** @type {IDBDatabase|null} */
let dbInstance = null;

/**
 * Open (or create/upgrade) the ccmixter2go IndexedDB database.
 * Creates missing object stores and indexes without dropping existing data.
 * Caches the connection for subsequent calls.
 *
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const tx = event.target.transaction;

      for (const name of STORE_NAMES) {
        let store;
        if (!db.objectStoreNames.contains(name)) {
          store = db.createObjectStore(name, { keyPath: 'id' });
        } else {
          store = tx.objectStore(name);
        }

        if (!store.indexNames.contains('filename')) {
          store.createIndex('filename', 'file_name', { unique: false });
        }
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the cached db instance. Throws if openDB() has not been called.
 * @returns {IDBDatabase}
 */
function getDB() {
  if (!dbInstance) throw new Error('Database not opened. Call openDB() first.');
  return dbInstance;
}

/**
 * Insert a song into the specified store. Skips if a song with the same id
 * already exists (no overwrite).
 *
 * @param {object} song
 * @param {string} storeName
 * @returns {Promise<void>}
 */
export function insertSong(song, storeName) {
  const db = getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    const getReq = store.get(song.id);
    getReq.onsuccess = () => {
      if (getReq.result != null) {
        resolve(); // already exists — skip
      } else {
        const putReq = store.put(song);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Get a song by its id from the specified store.
 *
 * @param {number} id
 * @param {string} storeName
 * @returns {Promise<object|null>}
 */
export function getSongById(id, storeName) {
  const db = getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a song by its id from the specified store.
 *
 * @param {number} id
 * @param {string} storeName
 * @returns {Promise<void>}
 */
export function deleteSong(id, storeName) {
  const db = getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Check whether a song with the given id exists in the specified store.
 *
 * @param {number} id
 * @param {string} storeName
 * @returns {Promise<boolean>}
 */
export function isSongInStore(id, storeName) {
  const db = getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result != null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the song with the highest id in the store.
 *
 * @param {string} storeName
 * @returns {Promise<object|null>}
 */
export function getHighestId(storeName) {
  const db = getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const range = IDBKeyRange.lowerBound(-1);
    const cursorReq = store.openCursor(range, 'prev');

    cursorReq.onsuccess = (event) => {
      const cursor = event.target.result;
      resolve(cursor ? cursor.value : null);
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/**
 * Get the song with the lowest id that has not been played and not been skipped.
 *
 * @param {string} storeName
 * @returns {Promise<object|null>}
 */
export function getLowestUnplayedId(storeName) {
  const db = getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const cursorReq = store.openCursor(null, 'next');

    cursorReq.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve(null);
        return;
      }
      const song = cursor.value;
      if (!song.isPlayed && !song.isSkipped) {
        resolve(song);
      } else {
        cursor.continue();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/**
 * Get the next song after `currentId` (higher id) that passes the filter.
 *
 * @param {number} currentId
 * @param {string} storeName
 * @param {function} filter - `(song) => boolean`
 * @returns {Promise<object|null>}
 */
export function getNextSong(currentId, storeName, filter) {
  const db = getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const range = IDBKeyRange.lowerBound(currentId, true);
    const cursorReq = store.openCursor(range, 'next');

    cursorReq.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve(null);
        return;
      }
      if (filter(cursor.value)) {
        resolve(cursor.value);
      } else {
        cursor.continue();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/**
 * Get the previous song before `currentId` (lower id) that passes the filter.
 *
 * @param {number} currentId
 * @param {string} storeName
 * @param {function} filter - `(song) => boolean`
 * @returns {Promise<object|null>}
 */
export function getPrevSong(currentId, storeName, filter) {
  const db = getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const range = IDBKeyRange.upperBound(currentId, true);
    const cursorReq = store.openCursor(range, 'prev');

    cursorReq.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve(null);
        return;
      }
      if (filter(cursor.value)) {
        resolve(cursor.value);
      } else {
        cursor.continue();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/**
 * Get the total number of records in the specified store.
 *
 * @param {string} storeName
 * @returns {Promise<number>}
 */
export function getCount(storeName) {
  const db = getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the song at a specific cursor index (0-based) in the store.
 * Used for shuffle: open a forward cursor and advance to the given index.
 *
 * @param {string} storeName
 * @param {number} index - 0-based position in key order.
 * @returns {Promise<object|null>}
 */
export function getSongAtIndex(storeName, index) {
  const db = getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const cursorReq = store.openCursor();
    let advanced = false;

    cursorReq.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve(null);
        return;
      }
      if (!advanced && index > 0) {
        advanced = true;
        cursor.advance(index);
        return;
      }
      resolve(cursor.value);
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/**
 * Get all song ids from the specified store, in key order.
 *
 * @param {string} storeName
 * @returns {Promise<number[]>}
 */
export function getAllIds(storeName) {
  const db = getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
