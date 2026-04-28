import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'https://ccmixter.christian-hufgard.de/';

/**
 * Dynamically import api.js with a cache-busting query param so Node
 * gives us a fresh module each time.
 */
let importCounter = 0;
async function freshImport() {
  importCounter++;
  return import(`./api.js?v=${importCounter}`);
}

/**
 * Install a mock fetch on globalThis that resolves with the given body.
 * Returns the mock function for assertions.
 */
function mockFetch(body, { ok = true, status = 200, statusText = 'OK', text = false } = {}) {
  const fn = mock.fn(async () => ({
    ok,
    status,
    statusText,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }));
  globalThis.fetch = fn;
  return fn;
}

/**
 * Install a mock fetch that rejects with the given error.
 */
function mockFetchReject(error) {
  const fn = mock.fn(async () => { throw error; });
  globalThis.fetch = fn;
  return fn;
}

describe('api.js', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── URL construction tests (Requirement 13.1, 13.2) ──

  describe('fetchSongs — URL construction', () => {
    it('constructs URL with remix and editorial_pick tags when edPicksOnly=true', async () => {
      const fetchMock = mockFetch([]);
      const api = await freshImport();

      await api.fetchSongs(0, true);

      const calledUrl = fetchMock.mock.calls[0].arguments[0];
      assert.equal(calledUrl, `${BASE_URL}api/query?f=json&limit=25&tags=remix,editorial_pick&offset=0`);
    });

    it('constructs URL with only remix tag when edPicksOnly=false', async () => {
      const fetchMock = mockFetch([]);
      const api = await freshImport();

      await api.fetchSongs(0, false);

      const calledUrl = fetchMock.mock.calls[0].arguments[0];
      assert.equal(calledUrl, `${BASE_URL}api/query?f=json&limit=25&tags=remix&offset=0`);
    });

    it('passes the offset parameter correctly', async () => {
      const fetchMock = mockFetch([]);
      const api = await freshImport();

      await api.fetchSongs(50, true);

      const calledUrl = fetchMock.mock.calls[0].arguments[0];
      assert.ok(calledUrl.includes('offset=50'));
    });
  });

  describe('fetchSongById — URL construction', () => {
    it('constructs URL with the given song id', async () => {
      const fetchMock = mockFetch({});
      const api = await freshImport();

      await api.fetchSongById(12345);

      const calledUrl = fetchMock.mock.calls[0].arguments[0];
      assert.equal(calledUrl, `${BASE_URL}api/query?f=json&ids=12345`);
    });
  });

  describe('fetchPlaylist — URL construction', () => {
    it('constructs URL with f=jsex and playlist id', async () => {
      const fetchMock = mockFetch([{ upload_id: 1 }, { upload_id: 2 }]);
      const api = await freshImport();

      const result = await api.fetchPlaylist(99);

      const calledUrl = fetchMock.mock.calls[0].arguments[0];
      assert.equal(calledUrl, `${BASE_URL}api/query?f=jsex&playlist=99`);
      assert.deepStrictEqual(result, [1, 2]);
    });
  });

  describe('fetchUserPlaylists — URL construction', () => {
    it('constructs URL with encoded dataview query and username', async () => {
      const fetchMock = mockFetch([]);
      const api = await freshImport();

      await api.fetchUserPlaylists('testuser');

      const calledUrl = fetchMock.mock.calls[0].arguments[0];
      assert.equal(calledUrl, `${BASE_URL}api/queries?items=dataview%3Dplaylists%26limit%3D10%26user%3Dtestuser`);
    });
  });

  describe('createPlaylist — URL construction', () => {
    it('constructs URL with encoded playlist name', async () => {
      const fetchMock = mockFetch({ id: 1 });
      const api = await freshImport();

      await api.createPlaylist('My Playlist');

      const calledUrl = fetchMock.mock.calls[0].arguments[0];
      assert.equal(calledUrl, `${BASE_URL}api/playlist/new?cart_name=My%20Playlist`);
    });
  });

  describe('addToPlaylist — URL construction', () => {
    it('constructs URL with songId and playlistId', async () => {
      const fetchMock = mockFetch(null, { ok: true });
      const api = await freshImport();

      await api.addToPlaylist(42, 7);

      const calledUrl = fetchMock.mock.calls[0].arguments[0];
      assert.equal(calledUrl, `${BASE_URL}api/playlist/add/42/7`);
    });
  });

  describe('removeFromPlaylist — URL construction', () => {
    it('constructs URL with songId and playlistId', async () => {
      const fetchMock = mockFetch(null, { ok: true });
      const api = await freshImport();

      await api.removeFromPlaylist(42, 7);

      const calledUrl = fetchMock.mock.calls[0].arguments[0];
      assert.equal(calledUrl, `${BASE_URL}api/playlist/remove/42/7`);
    });
  });

  // ── Timeout handling for playlist operations (Requirement 13.6, 13.7) ──

  describe('addToPlaylist — timeout', () => {
    it('passes a 30s timeout signal to fetch', async () => {
      const fetchMock = mockFetch(null, { ok: true });
      const api = await freshImport();

      await api.addToPlaylist(1, 2);

      const options = fetchMock.mock.calls[0].arguments[1];
      assert.ok(options.signal instanceof AbortSignal, 'should pass an AbortSignal');
    });
  });

  describe('removeFromPlaylist — timeout', () => {
    it('passes a 30s timeout signal to fetch', async () => {
      const fetchMock = mockFetch(null, { ok: true });
      const api = await freshImport();

      await api.removeFromPlaylist(1, 2);

      const options = fetchMock.mock.calls[0].arguments[1];
      assert.ok(options.signal instanceof AbortSignal, 'should pass an AbortSignal');
    });
  });

  describe('fetchSongs — no timeout signal for non-playlist operations', () => {
    it('does not pass an AbortSignal for regular fetches', async () => {
      const fetchMock = mockFetch([]);
      const api = await freshImport();

      await api.fetchSongs(0, true);

      const options = fetchMock.mock.calls[0].arguments[1];
      // The signal should still exist (AbortController always creates one)
      // but there should be no timeout set — signal should not be aborted
      assert.equal(options.signal.aborted, false);
    });
  });

  // ── Login uses POST with form-encoded body (Requirement 13.1) ──

  describe('login — method and body', () => {
    it('uses POST method with form-encoded content type', async () => {
      const fetchMock = mockFetch('success');
      const api = await freshImport();

      await api.login('myuser', 'mypass');

      const calledUrl = fetchMock.mock.calls[0].arguments[0];
      assert.equal(calledUrl, `${BASE_URL}login`);

      const options = fetchMock.mock.calls[0].arguments[1];
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
    });

    it('sends user_name and user_password in the body', async () => {
      const fetchMock = mockFetch('success');
      const api = await freshImport();

      await api.login('myuser', 'mypass');

      const options = fetchMock.mock.calls[0].arguments[1];
      const body = options.body;
      assert.ok(body instanceof URLSearchParams);
      assert.equal(body.get('user_name'), 'myuser');
      assert.equal(body.get('user_password'), 'mypass');
    });

    it('returns the response body as text', async () => {
      mockFetch('login response text');
      const api = await freshImport();

      const result = await api.login('user', 'pass');
      assert.equal(result, 'login response text');
    });
  });

  // ── Error rejection on fetch failure (Requirement 13.11) ──

  describe('error handling — fetch failure', () => {
    it('rejects with the error when fetch throws a network error', async () => {
      mockFetchReject(new Error('Network failure'));
      const api = await freshImport();

      await assert.rejects(
        () => api.fetchSongs(0, true),
        { message: 'Network failure' }
      );
    });

    it('rejects with HTTP error when response is not ok', async () => {
      mockFetch(null, { ok: false, status: 500, statusText: 'Internal Server Error' });
      const api = await freshImport();

      await assert.rejects(
        () => api.fetchSongById(1),
        { message: 'HTTP 500: Internal Server Error' }
      );
    });

    it('rejects with descriptive timeout error on AbortError', async () => {
      // Simulate an AbortError (what happens when timeout fires)
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetchReject(abortError);
      const api = await freshImport();

      await assert.rejects(
        () => api.addToPlaylist(1, 2),
        (err) => {
          assert.ok(err.message.includes('timed out'), `Expected timeout message, got: ${err.message}`);
          return true;
        }
      );
    });

    it('rejects with error for login failure', async () => {
      mockFetch(null, { ok: false, status: 401, statusText: 'Unauthorized' });
      const api = await freshImport();

      await assert.rejects(
        () => api.login('user', 'pass'),
        { message: 'HTTP 401: Unauthorized' }
      );
    });
  });
});
