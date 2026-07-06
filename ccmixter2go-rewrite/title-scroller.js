/**
 * Title scroller module — animates the browser tab title with the current song info.
 *
 * @module title-scroller
 */

let intervalId = null;
let timeoutId = null;
let fullTitle = '';
let authorLen = 0;
let pos = 0;

/**
 * Start scrolling the browser tab title with "{title} / {author}".
 *
 * Shifts the title left by one character every 500ms. When the remaining
 * string length drops to or below the author name length, resets to the
 * full title. If called while already scrolling, resets with a 2000ms pause.
 *
 * @param {string} title - Song title.
 * @param {string} author - Song author.
 */
export function startTitleScroller(title, author) {
  stopTitleScroller();

  fullTitle = title + ' / ' + author;
  authorLen = author.length;
  pos = 0;
  document.title = fullTitle;

  // Pause 2000ms before starting the scroll
  timeoutId = setTimeout(() => {
    timeoutId = null;
    intervalId = setInterval(() => {
      pos++;
      const scrolled = fullTitle.substring(pos);
      if (scrolled.length <= authorLen) {
        pos = 0;
        document.title = fullTitle;
      } else {
        document.title = scrolled;
      }
    }, 500);
  }, 2000);
}

/**
 * Stop the title scroller and clear all timers.
 */
export function stopTitleScroller() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  pos = 0;
}
