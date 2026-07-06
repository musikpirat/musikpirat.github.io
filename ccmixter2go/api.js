const BASE_URL = 'https://ccmixter.christian-hufgard.de/';
const PLAYLIST_TIMEOUT_MS = 30000;

/**
 * Fetch with an optional timeout via AbortController.
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number|null} [timeoutMs]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = null) {
  const controller = new AbortController();
  let timer;
  if (timeoutMs) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fetch a page of songs from the API.
 * @param {number} offset
 * @param {boolean} edPicksOnly
 * @returns {Promise<object[]>}
 */
export async function fetchSongs(offset, edPicksOnly) {
  const tags = edPicksOnly ? 'remix,editorial_pick' : 'remix';
  const url = `${BASE_URL}api/query?f=json&limit=25&tags=${tags}&offset=${offset}`;
  const response = await fetchWithTimeout(url);
  return response.json();
}

/**
 * Fetch a single song by its upload ID.
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function fetchSongById(id) {
  const url = `${BASE_URL}api/query?f=json&ids=${id}`;
  const response = await fetchWithTimeout(url);
  return response.json();
}

/**
 * Fetch the song IDs in a playlist.
 * @param {number} playlistId
 * @returns {Promise<number[]>}
 */
export async function fetchPlaylist(playlistId) {
  const url = `${BASE_URL}api/query?f=jsex&playlist=${playlistId}`;
  const response = await fetchWithTimeout(url);
  const data = await response.json();
  return data.map((item) => item.upload_id);
}

/**
 * Fetch full song data for all songs in a playlist.
 * @param {number} playlistId
 * @returns {Promise<object[]>} Array of raw API song objects.
 */
export async function fetchPlaylistSongs(playlistId) {
  const ids = await fetchPlaylist(playlistId);
  const songs = [];
  for (const id of ids) {
    const raw = await fetchSongById(id);
    const item = Array.isArray(raw) ? raw[0] : raw;
    if (item) songs.push(item);
  }
  return songs;
}

/**
 * Fetch the playlists for a given user.
 * @param {string} username
 * @returns {Promise<object[]>}
 */
export async function fetchUserPlaylists(username) {
  const url = `${BASE_URL}api/queries?items=dataview%3Dplaylists%26limit%3D10%26user%3D${username}`;
  const response = await fetchWithTimeout(url);
  return response.json();
}

/**
 * Add a song to a playlist (30s timeout).
 * @param {number} songId
 * @param {number} playlistId
 * @returns {Promise<void>}
 */
export async function addToPlaylist(songId, playlistId) {
  const url = `${BASE_URL}api/playlist/add/${songId}/${playlistId}`;
  await fetchWithTimeout(url, {}, PLAYLIST_TIMEOUT_MS);
}

/**
 * Remove a song from a playlist (30s timeout).
 * @param {number} songId
 * @param {number} playlistId
 * @returns {Promise<void>}
 */
export async function removeFromPlaylist(songId, playlistId) {
  const url = `${BASE_URL}api/playlist/remove/${songId}/${playlistId}`;
  await fetchWithTimeout(url, {}, PLAYLIST_TIMEOUT_MS);
}

/**
 * Create a new playlist with the given name.
 * @param {string} name
 * @returns {Promise<object>}
 */
export async function createPlaylist(name) {
  const url = `${BASE_URL}api/playlist/new?cart_name=${encodeURIComponent(name)}`;
  const response = await fetchWithTimeout(url);
  return response.json();
}

/**
 * Log in to ccMixter via the proxy.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<string>} response body text
 */
export async function login(username, password) {
  const url = `${BASE_URL}login`;
  const body = new URLSearchParams({
    user_name: username,
    user_password: password,
  });
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return response.text();
}
