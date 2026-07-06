/**
 * Player module — wraps a single <audio> element for playback control.
 */

const ORIGINAL_PREFIX = 'http://ccmixter.org/content/';
const ORIGINAL_PREFIX_HTTPS = 'https://ccmixter.org/content/';
const PROXY_PREFIX = 'https://ccmixter.christian-hufgard.de/content/';

/**
 * Replaces ccMixter content URLs with the HTTPS proxy equivalent.
 * @param {string} url
 * @returns {string}
 */
export function proxyUrl(url) {
  if (typeof url !== 'string') return url;
  if (url.startsWith(ORIGINAL_PREFIX)) {
    return PROXY_PREFIX + url.slice(ORIGINAL_PREFIX.length);
  }
  if (url.startsWith(ORIGINAL_PREFIX_HTTPS)) {
    return PROXY_PREFIX + url.slice(ORIGINAL_PREFIX_HTTPS.length);
  }
  return url;
}

/**
 * Creates a Player instance wrapping a single <audio> element.
 * @returns {Player}
 */
export function createPlayer() {
  const audio = new Audio();
  let timeUpdateCb = null;
  let endedCb = null;
  let errorCb = null;

  function onTimeUpdateHandler() {
    if (timeUpdateCb) {
      timeUpdateCb(audio.currentTime, audio.duration);
    }
  }

  function onEndedHandler() {
    if (endedCb) {
      endedCb();
    }
  }

  function onErrorHandler(e) {
    if (errorCb) {
      errorCb(e);
    }
  }

  audio.addEventListener('timeupdate', onTimeUpdateHandler);
  audio.addEventListener('ended', onEndedHandler);
  audio.addEventListener('error', onErrorHandler);

  return {
    /** Start or resume playback. */
    play() {
      audio.play();
    },

    /** Pause playback. */
    pause() {
      audio.pause();
    },

    /** Toggle between play and pause. */
    toggle() {
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    },

    /**
     * Seek to a position in the current track.
     * @param {number} fraction — 0.0 to 1.0
     */
    seek(fraction) {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = fraction * audio.duration;
      }
    },

    /**
     * Load a new song URL. Proxies ccMixter content URLs automatically.
     * @param {string} url
     */
    loadSong(url) {
      audio.src = proxyUrl(url);
      audio.load();
    },

    /**
     * Register a callback for time updates during playback.
     * @param {(currentTime: number, duration: number) => void} callback
     */
    onTimeUpdate(callback) {
      timeUpdateCb = callback;
    },

    /**
     * Register a callback for when the current track ends.
     * @param {() => void} callback
     */
    onEnded(callback) {
      endedCb = callback;
    },

    /**
     * Register a callback for audio errors.
     * @param {(error: Event) => void} callback
     */
    onError(callback) {
      errorCb = callback;
    },

    /**
     * Returns true if audio is currently playing (not paused).
     * @returns {boolean}
     */
    isPlaying() {
      return !audio.paused;
    },

    /**
     * Clean up: pause, remove listeners, clear source.
     */
    destroy() {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdateHandler);
      audio.removeEventListener('ended', onEndedHandler);
      audio.removeEventListener('error', onErrorHandler);
      audio.src = '';
    },
  };
}
