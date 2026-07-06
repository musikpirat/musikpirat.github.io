/**
 * Swipe handler module — gesture recognition using pointer events.
 *
 * @module swipe
 */

const SWIPE_THRESHOLD = 50; // px horizontal movement to trigger swipe
const TAP_HOLD_TIME = 600; // ms to trigger tap-hold
const TAP_HOLD_MOVE_LIMIT = 10; // px max movement during tap-hold

/**
 * Attach swipe and tap-hold gesture handlers to an element.
 *
 * Uses pointerdown/pointermove/pointerup events.
 * - Swipe left: horizontal movement > SWIPE_THRESHOLD to the left
 * - Swipe right: horizontal movement > SWIPE_THRESHOLD to the right
 * - Tap-hold: 600ms press without moving more than 10px
 *
 * @param {HTMLElement} element - The element to listen on.
 * @param {object} callbacks
 * @param {() => void} callbacks.onSwipeLeft
 * @param {() => void} callbacks.onSwipeRight
 * @param {() => void} callbacks.onTapHold
 * @returns {() => void} Detach function that removes all listeners.
 */
export function attachSwipeHandler(element, { onSwipeLeft, onSwipeRight, onTapHold }) {
  let startX = 0;
  let startY = 0;
  let holdTimer = null;
  let gestureHandled = false;

  function onPointerDown(e) {
    startX = e.clientX;
    startY = e.clientY;
    gestureHandled = false;

    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      if (!gestureHandled) {
        gestureHandled = true;
        onTapHold();
      }
    }, TAP_HOLD_TIME);
  }

  function onPointerMove(e) {
    if (gestureHandled) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Cancel tap-hold if moved too far
    if (dist > TAP_HOLD_MOVE_LIMIT) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function onPointerUp(e) {
    clearTimeout(holdTimer);
    holdTimer = null;

    if (gestureHandled) return;

    const dx = e.clientX - startX;

    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      gestureHandled = true;
      if (dx < 0) {
        onSwipeLeft();
      } else {
        onSwipeRight();
      }
    }
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);

  return function detach() {
    clearTimeout(holdTimer);
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
  };
}
