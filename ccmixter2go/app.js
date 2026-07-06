/**
 * app.js — Bootstrap and orchestration for ccMixter2go.
 *
 * Imports all modules and wires them together. This is the sole entry point
 * loaded by index.html via <script type="module">.
 */

import { openDB, insertSong, getSongById, deleteSong, getHighestId, getLowestUnplayedId, getNextSong, getPrevSong, getCount, getSongAtIndex, isSongInStore } from './db.js';
import { fetchSongs, fetchSongById, fetchPlaylist, fetchUserPlaylists, addToPlaylist, removeFromPlaylist, createPlaylist as apiCreatePlaylist, login } from './api.js';
import { parseSongFromAPI } from './song-parser.js';
import { createPlayer } from './player.js';
import { renderSongCard, setPlayMode, updateProgress, showDialog, showOnboarding, slideLeft, slideRight } from './ui.js';
import { attachSwipeHandler } from './swipe.js';
import { startTitleScroller, stopTitleScroller } from './title-scroller.js';
import { createShuffleSequence, nextFromSequence } from './shuffle.js';

// --- State ---
let db = null;
let player = null;
let currentSong = null;
let playMode = 'edPicks'; // 'edPicks' | 'favourites' | 'songs'
let shuffleSequence = [];
let playlistId = -1;
let user = null;
let password = null;

// --- DOM refs ---
const songContainer = document.getElementById('song-container');
const settingsBtn = document.getElementById('settings-btn');

// --- Helpers ---

/** Get the store name for the current play mode. */
function storeForMode(mode) {
  if (mode === 'edPicks') return 'edPicks';
  if (mode === 'favourites') return 'favourites';
  return 'songs';
}

/** Song filter for navigation based on play mode. */
function songFilter(song) {
  if (playMode === 'edPicks') return song.isEdPick && !song.isSkipped;
  if (playMode === 'favourites') return true;
  return !song.isSkipped && !song.isPlayed;
}

/** Persist a song update to the appropriate stores. */
async function persistSong(song) {
  const store = storeForMode(playMode);
  const tx1 = db.transaction(store, 'readwrite');
  tx1.objectStore(store).put(song);
  // Also update in 'songs' if we're in a filtered mode
  if (store !== 'songs') {
    const tx2 = db.transaction('songs', 'readwrite');
    tx2.objectStore('songs').put(song);
  }
}

/** Load and render a song into the UI. */
async function loadSong(song) {
  currentSong = song;
  localStorage.setItem('currentSongId', JSON.stringify(song.id));
  renderSongCard(song, songContainer);
  startTitleScroller(song.title, song.author);

  // Wire favourite star click on the rendered card
  const favEl = songContainer.querySelector('.favourite');
  if (favEl) {
    favEl.addEventListener('click', () => toggleFavourite());
  }
}

/** Fetch songs from API, parse, and store in DB. Returns parsed songs. */
async function fetchAndStoreSongs(offset, edPicksOnly) {
  const raw = await fetchSongs(offset, edPicksOnly);
  const songs = [];
  for (const item of raw) {
    const song = parseSongFromAPI(item);
    if (song) {
      await insertSong(song, 'songs');
      if (song.isEdPick) {
        await insertSong(song, 'edPicks');
      }
      songs.push(song);
    }
  }
  return songs;
}

// =====================================================================
// 14.2 — Play Mode Selection
// =====================================================================

function wirePlayModeSelection() {
  const edPicksBtn = document.getElementById('edPicks');
  const favouritesBtn = document.getElementById('favourites');
  const songsBtn = document.getElementById('songs');

  edPicksBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    playMode = 'edPicks';
    localStorage.setItem('playMode', JSON.stringify(playMode));
    setPlayMode(playMode);
    if (player) player.pause();
    const song = await getHighestId('edPicks');
    if (song && songFilter(song)) {
      await loadSong(song);
    } else if (song) {
      const prev = await getPrevSong(song.id, 'edPicks', songFilter);
      if (prev) await loadSong(prev);
      else showDialog('No songs', 'No edPicks available.');
    } else {
      showDialog('No songs', 'No edPicks available.');
    }
  });

  favouritesBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    playMode = 'favourites';
    localStorage.setItem('playMode', JSON.stringify(playMode));
    setPlayMode(playMode);
    if (player) player.pause();
    const count = await getCount('favourites');
    if (count === 0) {
      showDialog('No favourites', 'Star some songs first to build your favourites.');
      return;
    }
    shuffleSequence = createShuffleSequence(count);
    await playNextFromShuffle();
  });

  songsBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    playMode = 'songs';
    localStorage.setItem('playMode', JSON.stringify(playMode));
    setPlayMode(playMode);
    if (player) player.pause();
    const song = await getHighestId('songs');
    if (song && songFilter(song)) {
      await loadSong(song);
    } else if (song) {
      const prev = await getPrevSong(song.id, 'songs', songFilter);
      if (prev) await loadSong(prev);
      else showDialog('No songs', 'All songs have been played or skipped.');
    }
  });
}

// =====================================================================
// 14.3 — Swipe Navigation
// =====================================================================

function wireSwipeNavigation() {
  attachSwipeHandler(songContainer, {
    async onSwipeLeft() {
      if (!currentSong) return;
      const store = storeForMode(playMode);
      let next = await getNextSong(currentSong.id, store, songFilter);
      if (!next) {
        try {
          await fetchAndStoreSongs(0, playMode === 'edPicks');
          next = await getNextSong(currentSong.id, store, songFilter);
        } catch { /* network error — ignore */ }
      }
      if (next) {
        const oldContainer = songContainer.cloneNode(true);
        songContainer.parentNode.insertBefore(oldContainer, songContainer);
        await loadSong(next);
        await slideLeft(oldContainer, songContainer);
      }
    },

    async onSwipeRight() {
      if (!currentSong) return;
      const store = storeForMode(playMode);
      let prev = await getPrevSong(currentSong.id, store, songFilter);
      if (!prev) {
        try {
          await fetchAndStoreSongs(currentSong.id, playMode === 'edPicks');
          prev = await getPrevSong(currentSong.id, store, songFilter);
        } catch { /* network error — ignore */ }
      }
      if (prev) {
        const oldContainer = songContainer.cloneNode(true);
        songContainer.parentNode.insertBefore(oldContainer, songContainer);
        await loadSong(prev);
        await slideRight(oldContainer, songContainer);
      }
    },

    onTapHold() {
      if (!currentSong) return;
      // Show discard confirmation
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      const dialog = document.createElement('div');
      dialog.className = 'dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.innerHTML = `
        <div class="dialog-header"><h2>Discard Song?</h2></div>
        <div class="dialog-body">
          <p>Song will be discarded without being heard.</p>
          <button id="discard-cancel" style="margin-right:8px">Cancel</button>
          <button id="discard-confirm">Discard</button>
        </div>`;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      document.getElementById('discard-cancel').addEventListener('click', () => overlay.remove());
      document.getElementById('discard-confirm').addEventListener('click', async () => {
        overlay.remove();
        currentSong.isSkipped = true;
        await persistSong(currentSong);
        // Remove cached MP3
        if ('caches' in window) {
          const cache = await caches.open('ccmixter2go');
          await cache.delete(currentSong.downloadLink);
        }
        // Navigate to previous song
        const store = storeForMode(playMode);
        const prev = await getPrevSong(currentSong.id, store, songFilter);
        if (prev) await loadSong(prev);
      });
    },
  });
}

// =====================================================================
// 14.4 — Audio Playback Controls
// =====================================================================

function wirePlaybackControls() {
  player = createPlayer();

  player.onTimeUpdate((currentTime, duration) => {
    if (duration > 0) {
      updateProgress('.play_status', (currentTime / duration) * 100);
    }
  });

  player.onEnded(async () => {
    if (!currentSong) return;
    currentSong.isPlayed = true;
    await persistSong(currentSong);
    updatePlayPauseButton(false);
    await autoAdvance();
  });

  player.onError(() => {
    showDialog('Playback Error', 'Could not load the audio file.');
    updatePlayPauseButton(false);
  });

  // Use event delegation on the song container since controls are re-rendered
  songContainer.addEventListener('click', async (e) => {
    const target = e.target;

    // Play/pause button
    if (target.closest('#play-pause-btn')) {
      if (!currentSong) return;
      player.toggle();
      const playing = player.isPlaying();
      updatePlayPauseButton(playing);
      if (playing) {
        currentSong.isPlaying = true;
        await persistSong(currentSong);
      }
      return;
    }

    // Progress bar seek
    const statusEl = target.closest('.status');
    if (statusEl) {
      const rect = statusEl.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      player.seek(Math.max(0, Math.min(1, fraction)));
      return;
    }

    // Rewind button
    if (target.closest('.rewind')) {
      if (player) player.pause();
      updatePlayPauseButton(false);
      if (playMode === 'favourites') {
        await playNextFromShuffle();
      } else {
        const store = storeForMode(playMode);
        const song = await getLowestUnplayedId(store);
        if (song) await loadSong(song);
      }
      return;
    }

    // Forward button
    if (target.closest('.forward')) {
      if (player) player.pause();
      updatePlayPauseButton(false);
      if (playMode === 'favourites') {
        await playNextFromShuffle();
      } else {
        const store = storeForMode(playMode);
        const song = await getHighestId(store);
        if (song) await loadSong(song);
      }
      return;
    }
  });
}

function updatePlayPauseButton(isPlaying) {
  const btn = songContainer.querySelector('#play-pause-btn');
  if (!btn) return;
  btn.classList.toggle('play', !isPlaying);
  btn.classList.toggle('pause', isPlaying);
  btn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
}

// =====================================================================
// 14.5 — Favourite / Star System
// =====================================================================

async function toggleFavourite() {
  if (!currentSong) return;
  currentSong.isFavourite = !currentSong.isFavourite;
  currentSong.wasFavourite = !currentSong.isFavourite;

  // Update UI star
  const favEl = songContainer.querySelector('.favourite');
  if (favEl) {
    favEl.classList.toggle('active', currentSong.isFavourite);
    favEl.setAttribute('aria-label', currentSong.isFavourite ? 'Remove from favourites' : 'Add to favourites');
  }

  if (currentSong.isFavourite) {
    await insertSong(currentSong, 'favourites');
  } else {
    await deleteSong(currentSong.id, 'favourites');
    // Remove cached MP3
    if ('caches' in window) {
      const cache = await caches.open('ccmixter2go');
      await cache.delete(currentSong.downloadLink);
    }
  }

  await persistSong(currentSong);

  // Sync with ccMixter playlist if logged in
  if (user && playlistId > -1) {
    try {
      if (currentSong.isFavourite) {
        await addToPlaylist(currentSong.id, playlistId);
      } else {
        await removeFromPlaylist(currentSong.id, playlistId);
      }
    } catch (err) {
      showDialog('Sync Error', 'Could not update ccMixter playlist: ' + err.message);
    }
  }
}

// =====================================================================
// 14.6 — Shuffle for Favourites Mode
// =====================================================================

async function playNextFromShuffle() {
  const count = await getCount('favourites');
  if (count === 0) {
    showDialog('No favourites', 'Star some songs to play favourites.');
    return;
  }
  if (count === 1) {
    const song = await getSongAtIndex('favourites', 0);
    if (song) {
      await loadSong(song);
      player.loadSong(song.downloadLink);
      player.play();
      updatePlayPauseButton(true);
    }
    return;
  }
  if (shuffleSequence.length === 0) {
    shuffleSequence = createShuffleSequence(count);
  }
  const { index, remaining } = nextFromSequence(shuffleSequence);
  shuffleSequence = remaining;
  const song = await getSongAtIndex('favourites', index);
  if (song) {
    await loadSong(song);
    player.loadSong(song.downloadLink);
    player.play();
    updatePlayPauseButton(true);
  }
}

/** Auto-advance after a song ends, based on play mode. */
async function autoAdvance() {
  if (playMode === 'favourites') {
    await playNextFromShuffle();
    return;
  }
  const store = storeForMode(playMode);
  // Try next newer song
  let next = await getNextSong(currentSong.id, store, songFilter);
  if (!next) {
    try {
      await fetchAndStoreSongs(0, playMode === 'edPicks');
      next = await getNextSong(currentSong.id, store, songFilter);
    } catch { /* offline */ }
  }
  if (next) {
    await loadSong(next);
    player.loadSong(next.downloadLink);
    player.play();
    updatePlayPauseButton(true);
  }
}

// =====================================================================
// 14.7 — Login and Playlist Sync
// =====================================================================

async function attemptLogin() {
  if (!user || !password) return;
  try {
    const responseText = await login(user, password);
    if (responseText.includes('var user_name = null;')) {
      showCredentialsDialog();
      return;
    }
    // Find or create ccMixter2go playlist
    const playlists = await fetchUserPlaylists(user);
    const existing = playlists.find((p) => p.cart_name === 'ccMixter2go');
    if (existing) {
      playlistId = existing.cart_id;
    } else {
      const created = await apiCreatePlaylist('ccMixter2go');
      playlistId = created.cart_id;
    }
    // Merge remote favourites with local
    if (playlistId > -1) {
      const remoteIds = await fetchPlaylist(playlistId);
      for (const id of remoteIds) {
        const inFavs = await isSongInStore(id, 'favourites');
        if (!inFavs) {
          // Fetch song data and add to favourites
          try {
            const rawArr = await fetchSongById(id);
            const raw = Array.isArray(rawArr) ? rawArr[0] : rawArr;
            const song = parseSongFromAPI(raw);
            if (song) {
              song.isFavourite = true;
              await insertSong(song, 'songs');
              await insertSong(song, 'favourites');
              if (song.isEdPick) await insertSong(song, 'edPicks');
            }
          } catch { /* skip songs that fail to fetch */ }
        }
      }
    }
  } catch {
    showCredentialsDialog();
  }
}

function showCredentialsDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.innerHTML = `
    <div class="dialog-header"><h2>ccMixter Credentials</h2>
      <button class="dialog-close" aria-label="Close">×</button>
    </div>
    <div class="dialog-body">
      <form id="login-form">
        <label for="login-user">Username:</label>
        <input type="text" id="login-user" autocomplete="off" value="${user || ''}" style="display:block;width:100%;margin-bottom:8px;padding:4px" />
        <label for="login-pass">Password:</label>
        <input type="password" id="login-pass" autocomplete="off" value="${password || ''}" style="display:block;width:100%;margin-bottom:12px;padding:4px" />
        <button type="submit">Login</button>
      </form>
    </div>`;
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  dialog.querySelector('.dialog-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    user = document.getElementById('login-user').value;
    password = document.getElementById('login-pass').value;
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('password', JSON.stringify(password));
    overlay.remove();
    await attemptLogin();
  });
}

// =====================================================================
// 14.8 — First-Run Onboarding
// =====================================================================

function checkOnboarding() {
  const initialStart = localStorage.getItem('initialStart');
  if (initialStart === null) {
    showOnboarding(document.body);
    localStorage.setItem('initialStart', JSON.stringify(false));
  }
}

// =====================================================================
// 14.9 — Settings Panel
// =====================================================================

function wireSettingsPanel() {
  settingsBtn.addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.setAttribute('role', 'dialog');
    panel.innerHTML = `
      <h2>Settings</h2>
      <ul>
        <li id="settings-help">Show help</li>
        <li id="settings-credits">Show credits</li>
        <li id="settings-login">ccMixter credentials</li>
      </ul>
      <button class="settings-close">Close</button>`;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    panel.querySelector('.settings-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('settings-help').addEventListener('click', () => {
      overlay.remove();
      showOnboarding(document.body);
    });

    document.getElementById('settings-credits').addEventListener('click', () => {
      overlay.remove();
      showDialog('Credits',
        'Control icons based on "dirty music" by Dirtworks, licensed under CC-BY 3.0. ' +
        'Coffee cup icon from OnlineWebFonts.com, licensed under CC BY 3.0.');
    });

    document.getElementById('settings-login').addEventListener('click', () => {
      overlay.remove();
      showCredentialsDialog();
    });
  });
}

// =====================================================================
// 14.10 — Title Scroller (wired in loadSong above)
// =====================================================================

window.addEventListener('beforeunload', () => stopTitleScroller());

// =====================================================================
// Bootstrap
// =====================================================================

async function init() {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.msg === 'progress') {
        updateProgress('.loading_status', event.data.percent);
      }
    });
  }

  // Open DB
  db = await openDB();

  // Restore play mode
  try {
    const stored = JSON.parse(localStorage.getItem('playMode'));
    if (stored && ['edPicks', 'favourites', 'songs'].includes(stored)) {
      playMode = stored;
    }
  } catch { /* use default */ }
  setPlayMode(playMode);

  // Restore credentials
  try { user = JSON.parse(localStorage.getItem('user')); } catch { /* ignore */ }
  try { password = JSON.parse(localStorage.getItem('password')); } catch { /* ignore */ }

  // Wire everything
  wirePlayModeSelection();
  wirePlaybackControls();
  wireSwipeNavigation();
  wireSettingsPanel();

  // First-run onboarding
  checkOnboarding();

  // Load current song
  const currentSongId = JSON.parse(localStorage.getItem('currentSongId') || '-1');
  const store = storeForMode(playMode);

  if (currentSongId > -1) {
    const song = await getSongById(currentSongId, store);
    if (song) {
      await loadSong(song);
    } else {
      // Song not found in current mode store — load highest
      const highest = await getHighestId(store);
      if (highest) await loadSong(highest);
    }
  } else {
    // First launch — fetch songs
    try {
      await fetchAndStoreSongs(0, playMode === 'edPicks');
    } catch { /* offline */ }
    const highest = await getHighestId(store);
    if (highest) await loadSong(highest);
  }

  // Auto-login if credentials stored
  if (user) {
    attemptLogin();
  }
}

init().catch((err) => console.error('ccMixter2go init failed:', err));
