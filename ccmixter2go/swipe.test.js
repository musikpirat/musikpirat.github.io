import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { attachSwipeHandler } from './swipe.js';

/**
 * Minimal mock element that supports addEventListener/removeEventListener
 * and allows dispatching pointer events manually.
 */
function createMockElement() {
  const listeners = {};
  return {
    addEventListener(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    removeEventListener(event, fn) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn);
      }
    },
    _emit(event, props = {}) {
      (listeners[event] || []).forEach((fn) => fn(props));
    },
    _listeners: listeners,
  };
}

describe('attachSwipeHandler', () => {
  let el;

  beforeEach(() => {
    el = createMockElement();
  });

  it('detects swipe left (movement > 50px to the left)', () => {
    let swipedLeft = false;
    attachSwipeHandler(el, {
      onSwipeLeft: () => { swipedLeft = true; },
      onSwipeRight: () => {},
      onTapHold: () => {},
    });

    el._emit('pointerdown', { clientX: 200, clientY: 100 });
    el._emit('pointermove', { clientX: 140, clientY: 100 });
    el._emit('pointerup', { clientX: 140, clientY: 100 });

    assert.equal(swipedLeft, true);
  });

  it('detects swipe right (movement > 50px to the right)', () => {
    let swipedRight = false;
    attachSwipeHandler(el, {
      onSwipeLeft: () => {},
      onSwipeRight: () => { swipedRight = true; },
      onTapHold: () => {},
    });

    el._emit('pointerdown', { clientX: 100, clientY: 100 });
    el._emit('pointermove', { clientX: 160, clientY: 100 });
    el._emit('pointerup', { clientX: 160, clientY: 100 });

    assert.equal(swipedRight, true);
  });

  it('does not trigger swipe for small movements', () => {
    let swipedLeft = false;
    let swipedRight = false;
    attachSwipeHandler(el, {
      onSwipeLeft: () => { swipedLeft = true; },
      onSwipeRight: () => { swipedRight = true; },
      onTapHold: () => {},
    });

    el._emit('pointerdown', { clientX: 100, clientY: 100 });
    el._emit('pointerup', { clientX: 130, clientY: 100 }); // 30px < 50px threshold

    assert.equal(swipedLeft, false);
    assert.equal(swipedRight, false);
  });

  it('detects tap-hold after 600ms without movement', (t) => {
    return new Promise((resolve) => {
      let tapHeld = false;
      attachSwipeHandler(el, {
        onSwipeLeft: () => {},
        onSwipeRight: () => {},
        onTapHold: () => { tapHeld = true; },
      });

      el._emit('pointerdown', { clientX: 100, clientY: 100 });

      setTimeout(() => {
        assert.equal(tapHeld, true);
        resolve();
      }, 700);
    });
  });

  it('cancels tap-hold if movement exceeds 10px', () => {
    return new Promise((resolve) => {
      let tapHeld = false;
      attachSwipeHandler(el, {
        onSwipeLeft: () => {},
        onSwipeRight: () => {},
        onTapHold: () => { tapHeld = true; },
      });

      el._emit('pointerdown', { clientX: 100, clientY: 100 });
      // Move 20px — exceeds 10px limit
      el._emit('pointermove', { clientX: 120, clientY: 100 });

      setTimeout(() => {
        assert.equal(tapHeld, false);
        resolve();
      }, 700);
    });
  });

  it('detach function removes all listeners', () => {
    const detach = attachSwipeHandler(el, {
      onSwipeLeft: () => {},
      onSwipeRight: () => {},
      onTapHold: () => {},
    });

    assert.ok(el._listeners['pointerdown'].length > 0);
    assert.ok(el._listeners['pointermove'].length > 0);
    assert.ok(el._listeners['pointerup'].length > 0);

    detach();

    assert.equal(el._listeners['pointerdown'].length, 0);
    assert.equal(el._listeners['pointermove'].length, 0);
    assert.equal(el._listeners['pointerup'].length, 0);
  });

  it('does not fire swipe after tap-hold already triggered', () => {
    return new Promise((resolve) => {
      let swipedLeft = false;
      let tapHeld = false;
      attachSwipeHandler(el, {
        onSwipeLeft: () => { swipedLeft = true; },
        onSwipeRight: () => {},
        onTapHold: () => { tapHeld = true; },
      });

      el._emit('pointerdown', { clientX: 200, clientY: 100 });

      setTimeout(() => {
        // Tap-hold should have fired
        assert.equal(tapHeld, true);
        // Now release with a big horizontal delta
        el._emit('pointerup', { clientX: 100, clientY: 100 });
        assert.equal(swipedLeft, false);
        resolve();
      }, 700);
    });
  });
});
