/**
 * UI module — DOM rendering, progress bars, dialogs, onboarding, and slide animations.
 *
 * @module ui
 */

/**
 * Render a song card into the given container element.
 *
 * Displays title, author, tags (prefixed "ccMixter-Tags: "), license badge,
 * favourite star, ccMixter link, and download link.
 *
 * @param {object} song - Song object from the data layer.
 * @param {HTMLElement} container - The DOM element to render into.
 */
export function renderSongCard(song, container) {
  container.innerHTML = '';

  // Credits: title + author
  const credits = document.createElement('div');
  credits.className = 'credits';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'title';
  titleSpan.textContent = song.title;
  credits.appendChild(titleSpan);

  const bySpan = document.createElement('span');
  bySpan.className = 'credit-by';
  bySpan.textContent = ' von ';
  credits.appendChild(bySpan);

  const authorSpan = document.createElement('span');
  authorSpan.className = 'author';
  authorSpan.textContent = song.author;
  authorSpan.setAttribute('role', 'button');
  authorSpan.setAttribute('aria-label', 'Browse songs by ' + song.author);
  credits.appendChild(authorSpan);

  container.appendChild(credits);

  // Controls: rewind, play/pause, forward (inside the card, matching old layout)
  const controls = document.createElement('div');
  controls.className = 'controls';
  controls.innerHTML =
    '<div class="rewind" role="button" aria-label="Rewind"></div>' +
    '<div class="player play" id="play-pause-btn" role="button" aria-label="Play"></div>' +
    '<div class="forward" role="button" aria-label="Forward"></div>';
  container.appendChild(controls);

  // Progress bar
  const status = document.createElement('div');
  status.className = 'status';
  status.id = 'progress-bar';
  status.innerHTML = '<div class="loading_status"></div><div class="play_status"></div>';
  container.appendChild(status);

  // License badge (CSS sprite)
  const licenseDiv = document.createElement('div');
  licenseDiv.className = 'license_div';
  const licenseLink = document.createElement('a');
  licenseLink.className = 'license ' + song.license;
  licenseLink.href = song.licenceLink;
  licenseLink.target = '_blank';
  licenseLink.rel = 'license noopener';
  licenseLink.setAttribute('aria-label', song.licenseName || 'Creative Commons License');
  licenseDiv.appendChild(licenseLink);
  container.appendChild(licenseDiv);

  // Favourite star
  const fav = document.createElement('div');
  fav.className = 'favourite' + (song.isFavourite ? ' active' : '');
  fav.setAttribute('role', 'button');
  fav.setAttribute('aria-label', song.isFavourite ? 'Remove from favourites' : 'Add to favourites');
  container.appendChild(fav);

  // ccMixter link
  const refDiv = document.createElement('div');
  refDiv.className = 'ccmixter_ref_div';
  const ccmixterRef = document.createElement('a');
  ccmixterRef.className = 'ccmixter_ref';
  ccmixterRef.href = song.url;
  ccmixterRef.target = '_blank';
  ccmixterRef.rel = 'noopener';
  ccmixterRef.innerHTML = 'Visit song @ <br/><img src="images/ccmixter-logo.png" alt="ccMixter-Logo" />';
  refDiv.appendChild(ccmixterRef);
  container.appendChild(refDiv);
}

/**
 * Update the active play mode button in the header.
 *
 * Removes 'active' class from all mode buttons and adds it to the one
 * matching the given mode.
 *
 * @param {string} mode - One of 'edPicks', 'favourites', 'songs'.
 * @param {HTMLElement} [headerEl=document] - Parent element containing the mode buttons.
 */
export function setPlayMode(mode, headerEl = document) {
  const buttons = headerEl.querySelectorAll('#edPicks, #favourites, #songs, #playlist');
  buttons.forEach((btn) => btn.classList.remove('active'));
  const active = headerEl.querySelector('#' + mode);
  if (active) {
    active.classList.add('active');
  }
}

/**
 * Set the width percentage on a progress bar element.
 *
 * @param {string} selector - CSS selector for the progress bar element (e.g. '.loading_status').
 * @param {number} percent - 0–100 value.
 * @param {HTMLElement} [parent=document] - Parent element to scope the query.
 */
export function updateProgress(selector, percent, parent = document) {
  const el = parent.querySelector(selector);
  if (el) {
    el.style.width = Math.max(0, Math.min(100, percent)) + '%';
  }
}

/**
 * Show a modal dialog with a title and message.
 *
 * Creates an overlay + dialog box. Clicking the close button or the overlay
 * removes the dialog from the DOM.
 *
 * @param {string} title - Dialog heading.
 * @param {string} message - Dialog body text.
 */
export function showDialog(title, message) {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-label', title);

  const header = document.createElement('div');
  header.className = 'dialog-header';

  const heading = document.createElement('h2');
  heading.textContent = title;
  header.appendChild(heading);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'dialog-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close dialog');
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'dialog-body';
  body.textContent = message;

  dialog.appendChild(header);
  dialog.appendChild(body);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

/** @type {Array<{title: string, body: string}>} */
const onboardingSlides = [
  {
    title: 'Welcome!',
    body:
      'Thanks for installing ccMixter2go. All music here is provided by the generous artists from ccMixter.org — a free remixing community based on Creative Commons licensing.',
  },
  {
    title: 'Easy access',
    body:
      'This app gives you easy access to the rich world of ccMixter music. Star songs you like, swipe away songs you don\'t, and let ccMixter2go remember where you left off.',
  },
  {
    title: 'Features',
    body:
      'Three main features: easy access to songs you like, distinguishing unheard from heard songs, and offline playback. Plus shuffle play for favourites and optional ccMixter playlist sync.',
  },
  {
    title: "Ed' Picks",
    body:
      'On first launch you\'ll see the latest editor-picked songs — a curated selection to get you started. Switch to "All Songs" anytime for the full ccMixter experience.',
  },
  {
    title: 'Usage',
    body:
      'Press Play to listen. Star songs you like. Swipe left for newer songs, right for older ones. Tap and hold to discard a song. Use the rewind/forward buttons to jump around.',
  },
  {
    title: 'ccMixter credentials',
    body:
      'You don\'t need an account to use ccMixter2go — favourites are stored locally. But if you log in, your favourites sync to a ccMixter playlist so you can access them on the website too.',
  },
];

/**
 * Show the onboarding carousel inside the given container.
 *
 * Renders a multi-slide carousel navigable by clicking prev/next buttons.
 * Returns a cleanup function that removes the carousel.
 *
 * @param {HTMLElement} container - Element to render the carousel into.
 * @returns {() => void} Cleanup function.
 */
export function showOnboarding(container) {
  let currentSlide = 0;

  const wrapper = document.createElement('div');
  wrapper.className = 'onboarding-overlay';
  wrapper.setAttribute('role', 'dialog');
  wrapper.setAttribute('aria-label', 'Onboarding');

  const carousel = document.createElement('div');
  carousel.className = 'onboarding-carousel';

  const content = document.createElement('div');
  content.className = 'onboarding-content';
  carousel.appendChild(content);

  const nav = document.createElement('div');
  nav.className = 'onboarding-nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'onboarding-prev';
  prevBtn.textContent = '← Previous';
  prevBtn.setAttribute('aria-label', 'Previous slide');
  nav.appendChild(prevBtn);

  const indicator = document.createElement('span');
  indicator.className = 'onboarding-indicator';
  nav.appendChild(indicator);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'onboarding-next';
  nextBtn.textContent = 'Next →';
  nextBtn.setAttribute('aria-label', 'Next slide');
  nav.appendChild(nextBtn);

  carousel.appendChild(nav);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'onboarding-close';
  closeBtn.textContent = 'Close';
  closeBtn.setAttribute('aria-label', 'Close onboarding');
  carousel.appendChild(closeBtn);

  wrapper.appendChild(carousel);

  function render() {
    const slide = onboardingSlides[currentSlide];
    content.innerHTML = '<h2>' + slide.title + '</h2><p>' + slide.body + '</p>';
    indicator.textContent = (currentSlide + 1) + ' / ' + onboardingSlides.length;
    prevBtn.disabled = currentSlide === 0;
    nextBtn.textContent =
      currentSlide === onboardingSlides.length - 1 ? 'Done' : 'Next →';
  }

  function cleanup() {
    wrapper.remove();
  }

  prevBtn.addEventListener('click', () => {
    if (currentSlide > 0) {
      currentSlide--;
      render();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentSlide < onboardingSlides.length - 1) {
      currentSlide++;
      render();
    } else {
      cleanup();
    }
  });

  closeBtn.addEventListener('click', cleanup);

  render();
  container.appendChild(wrapper);

  return cleanup;
}

/**
 * Slide the current element out to the right and a new element in from the left.
 * Used when navigating to an older (previous) song.
 *
 * @param {HTMLElement} outEl - Element sliding out.
 * @param {HTMLElement} inEl - Element sliding in.
 * @returns {Promise<void>} Resolves when the animation completes.
 */
export function slideRight(outEl, inEl) {
  return slide(outEl, inEl, 'translate3d(-100%, 0, 0)', 'translate3d(100%, 0, 0)');
}

/**
 * Slide the current element out to the left and a new element in from the right.
 * Used when navigating to a newer (next) song.
 *
 * @param {HTMLElement} outEl - Element sliding out.
 * @param {HTMLElement} inEl - Element sliding in.
 * @returns {Promise<void>} Resolves when the animation completes.
 */
export function slideLeft(outEl, inEl) {
  return slide(outEl, inEl, 'translate3d(100%, 0, 0)', 'translate3d(-100%, 0, 0)');
}

/**
 * Internal helper: animate two elements with CSS transitions.
 *
 * @param {HTMLElement} outEl
 * @param {HTMLElement} inEl
 * @param {string} inStart - Initial transform for the incoming element.
 * @param {string} outEnd - Final transform for the outgoing element.
 * @returns {Promise<void>}
 */
function slide(outEl, inEl, inStart, outEnd) {
  return new Promise((resolve) => {
    const duration = 300; // ms

    // Position incoming element at its start
    inEl.style.transition = 'none';
    inEl.style.transform = inStart;
    inEl.style.display = 'block';

    // Force reflow so the initial transform is applied before transitioning
    inEl.offsetHeight; // eslint-disable-line no-unused-expressions

    // Start transitions
    const transition = 'transform ' + duration + 'ms ease-in-out';
    outEl.style.transition = transition;
    inEl.style.transition = transition;

    outEl.style.transform = outEnd;
    inEl.style.transform = 'translate3d(0, 0, 0)';

    function onDone() {
      outEl.removeEventListener('transitionend', onDone);
      outEl.remove();
      inEl.style.transition = '';
      inEl.style.transform = '';
      resolve();
    }

    outEl.addEventListener('transitionend', onDone, { once: true });

    // Fallback in case transitionend doesn't fire
    setTimeout(onDone, duration + 50);
  });
}
