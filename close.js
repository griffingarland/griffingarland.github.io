/* Click the red traffic light and the panels "close" — then the assistant
   turns up to explain that they didn't.

   Progressive enhancement, same deal as minimize.js: with JS off the red dot
   is an inert button and the page is exactly the page. Nothing here is
   required to read the site. */
(() => {
  'use strict';
  const btn = document.querySelector('.titlebar .r');
  if (!btn) return;

  // .skip rides along so the (visually hidden) skip link can't tab you into
  // the closed page behind the assistant.
  const panels = [...document.querySelectorAll('.window, .footbar, .skip')];
  if (!panels.length) return;

  const TEXT = "It looks like you're trying to close the website, " +
               "I'm sorry I'm afraid I can't do that, would you like to go back?";

  // Knock-off Clippy: one bent-wire path plus a face. Inline (rather than an
  // <img>) so CSS can blink the eyes and bob the whole thing.
  const CLIP = `
<svg class="clip" viewBox="20 24 80 140" width="80" height="140" aria-hidden="true" focusable="false">
  <path class="clip-wire"
        d="M78 52 V132 A20 20 0 0 1 38 132 V64 A14 14 0 0 1 66 64 V122"
        fill="none" stroke="currentColor" stroke-width="9"
        stroke-linecap="round" stroke-linejoin="round"/>
  <g class="clip-eye">
    <circle class="clip-white" cx="44" cy="62" r="13"/>
    <circle class="clip-pupil" cx="48" cy="64" r="5.5"/>
  </g>
  <g class="clip-eye">
    <circle class="clip-white" cx="74" cy="62" r="13"/>
    <circle class="clip-pupil" cx="78" cy="64" r="5.5"/>
  </g>
  <g class="clip-brows">
    <path d="M29 42 Q40 32 53 38"/><path d="M89 42 Q78 32 65 38"/>
  </g>
</svg>`;

  const wrap = document.createElement('div');
  wrap.id = 'assistant';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'assistant-text');
  wrap.hidden = true;
  wrap.innerHTML =
    '<div class="assistant-inner">' +
      '<div class="bubble">' +
        '<p class="bubble-who"><span class="prompt">$</span> clippy --help</p>' +
        '<p id="assistant-text">' + TEXT + '</p>' +
        '<button type="button" id="assistant-back">Yes, take me back</button>' +
      '</div>' +
      '<div class="clippy">' + CLIP + '</div>' +
    '</div>';
  document.body.appendChild(wrap);

  const back = wrap.querySelector('#assistant-back');
  let timer = 0;

  function setClosed(on) {
    clearTimeout(timer);
    document.body.classList.toggle('closed', on);
    // inert is what actually takes the panels out of tab order and the
    // accessibility tree; the transform alone would leave them reachable.
    for (const p of panels) { p.inert = on; p.setAttribute('aria-hidden', String(on)); }

    if (on) {
      // Tetris listens for this to pause itself — a closed window shouldn't
      // still be eating arrow keys.
      document.dispatchEvent(new CustomEvent('appminimize'));
      timer = setTimeout(() => {
        wrap.hidden = false;
        wrap.offsetHeight;          // flush layout so the transition runs
        wrap.classList.add('show');
        back.focus({ preventScroll: true });
      }, 1000);
    } else {
      wrap.classList.remove('show');
      wrap.hidden = true;
      btn.focus({ preventScroll: true });
    }
  }

  btn.addEventListener('click', () => setClosed(true));
  back.addEventListener('click', () => setClosed(false));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('closed')) {
      e.preventDefault();
      setClosed(false);
    }
  });
})();
