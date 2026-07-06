import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { proxyUrl, createPlayer } from './player.js';

// --- Mock Audio ---

function createMockAudio() {
  const listeners = {};
  return {
    src: '',
    paused: true,
    currentTime: 0,
    duration: NaN,
    addEventListener(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    removeEventListener(event, fn) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn);
      }
    },
    play() {
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
    load() {},
    _emit(event, arg) {
      (listeners[event] || []).forEach((fn) => fn(arg));
    },
    _listeners: listeners,
  };
}

let mockAudio;

describe('proxyUrl', () => {
  it('replaces http://ccmixter.org/content/ with proxy URL', () => {
    const input = 'http://ccmixter.org/content/artist/song.mp3';
    const expected = 'https://ccmixter.christian-hufgard.de/content/artist/song.mp3';
    assert.equal(proxyUrl(input), expected);
  });

  it('replaces https://ccmixter.org/content/ with proxy URL', () => {
    const input = 'https://ccmixter.org/content/artist/song.mp3';
    const expected = 'https://ccmixter.christian-hufgard.de/content/artist/song.mp3';
    assert.equal(proxyUrl(input), expected);
  });

  it('leaves non-ccmixter URLs unchanged', () => {
    const input = 'https://example.com/audio/track.mp3';
    assert.equal(proxyUrl(input), input);
  });

  it('leaves https ccmixter URLs that are not /content/ unchanged', () => {
    const input = 'https://ccmixter.org/api/query?f=json';
    assert.equal(proxyUrl(input), input);
  });

  it('handles empty string', () => {
    assert.equal(proxyUrl(''), '');
  });

  it('handles non-string input gracefully', () => {
    assert.equal(proxyUrl(undefined), undefined);
    assert.equal(proxyUrl(null), null);
  });
});

describe('createPlayer', () => {
  beforeEach(() => {
    mockAudio = createMockAudio();
    globalThis.Audio = function () {
      return mockAudio;
    };
  });

  afterEach(() => {
    delete globalThis.Audio;
  });

  describe('play/pause/toggle', () => {
    it('play() starts playback', () => {
      const player = createPlayer();
      player.play();
      assert.equal(player.isPlaying(), true);
    });

    it('pause() stops playback', () => {
      const player = createPlayer();
      player.play();
      player.pause();
      assert.equal(player.isPlaying(), false);
    });

    it('toggle() starts playback when paused', () => {
      const player = createPlayer();
      player.toggle();
      assert.equal(player.isPlaying(), true);
    });

    it('toggle() pauses playback when playing', () => {
      const player = createPlayer();
      player.play();
      player.toggle();
      assert.equal(player.isPlaying(), false);
    });

    it('isPlaying() returns false initially', () => {
      const player = createPlayer();
      assert.equal(player.isPlaying(), false);
    });
  });

  describe('seek', () => {
    it('sets currentTime based on fraction * duration', () => {
      const player = createPlayer();
      mockAudio.duration = 200;
      player.seek(0.5);
      assert.equal(mockAudio.currentTime, 100);
    });

    it('seeks to the beginning with fraction 0', () => {
      const player = createPlayer();
      mockAudio.duration = 200;
      player.seek(0);
      assert.equal(mockAudio.currentTime, 0);
    });

    it('seeks to the end with fraction 1', () => {
      const player = createPlayer();
      mockAudio.duration = 200;
      player.seek(1);
      assert.equal(mockAudio.currentTime, 200);
    });

    it('does nothing when duration is NaN', () => {
      const player = createPlayer();
      // duration defaults to NaN
      player.seek(0.5);
      assert.equal(mockAudio.currentTime, 0);
    });

    it('does nothing when duration is 0', () => {
      const player = createPlayer();
      mockAudio.duration = 0;
      player.seek(0.5);
      assert.equal(mockAudio.currentTime, 0);
    });
  });

  describe('loadSong', () => {
    it('proxies ccmixter content URLs', () => {
      const player = createPlayer();
      player.loadSong('http://ccmixter.org/content/artist/song.mp3');
      assert.equal(mockAudio.src, 'https://ccmixter.christian-hufgard.de/content/artist/song.mp3');
    });

    it('passes non-ccmixter URLs through unchanged', () => {
      const player = createPlayer();
      player.loadSong('https://example.com/track.mp3');
      assert.equal(mockAudio.src, 'https://example.com/track.mp3');
    });
  });

  describe('callbacks', () => {
    it('onTimeUpdate fires with currentTime and duration', () => {
      const player = createPlayer();
      let received = null;
      player.onTimeUpdate((ct, dur) => { received = { ct, dur }; });
      mockAudio.currentTime = 42;
      mockAudio.duration = 180;
      mockAudio._emit('timeupdate');
      assert.deepStrictEqual(received, { ct: 42, dur: 180 });
    });

    it('onEnded fires when track ends', () => {
      const player = createPlayer();
      let called = false;
      player.onEnded(() => { called = true; });
      mockAudio._emit('ended');
      assert.equal(called, true);
    });

    it('onError fires on audio error', () => {
      const player = createPlayer();
      let errorEvent = null;
      player.onError((e) => { errorEvent = e; });
      const fakeError = { type: 'error' };
      mockAudio._emit('error', fakeError);
      assert.equal(errorEvent, fakeError);
    });
  });

  describe('destroy', () => {
    it('pauses audio and clears src', () => {
      const player = createPlayer();
      player.play();
      player.destroy();
      assert.equal(mockAudio.paused, true);
      assert.equal(mockAudio.src, '');
    });

    it('removes event listeners', () => {
      const player = createPlayer();
      player.destroy();
      assert.equal((mockAudio._listeners['timeupdate'] || []).length, 0);
      assert.equal((mockAudio._listeners['ended'] || []).length, 0);
      assert.equal((mockAudio._listeners['error'] || []).length, 0);
    });
  });
});
