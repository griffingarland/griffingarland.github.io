/* Click the yellow traffic light to minimise the window into a dock icon.
   Progressive enhancement: without this script the dot is inert markup and
   every page behaves exactly as before. */
(() => {
  'use strict';
  const btn = document.querySelector('.titlebar .y');
  if (!btn) return;

  const panels = [...document.querySelectorAll('.window, .footbar')];
  if (!panels.length) return;

  const bar = document.createElement('div');
  bar.id = 'dockbar';

  const dock = document.createElement('button');
  dock.id = 'dock';
  dock.type = 'button';
  dock.setAttribute('aria-label', 'Restore window');
  dock.innerHTML = '<img src="/favicon.svg" alt="" width="46" height="46">';
  bar.appendChild(dock);

  // Set dressing. Spans rather than buttons, so they are not focusable, not
  // clickable, and hidden from screen readers — they exist to make the dock
  // look like a dock.
  const fake = (icon, name) =>
    '<span class="dock-app" aria-hidden="true" title="' + name + '">' +
    '<img src="/dock-' + icon + '.svg" alt="" width="46" height="46"></span>';
  bar.insertAdjacentHTML('beforeend', fake('settings', 'Settings'));
  bar.insertAdjacentHTML('beforeend', '<span class="dock-sep" aria-hidden="true"></span>');
  bar.insertAdjacentHTML('beforeend', fake('trash', 'Trash'));
  document.body.appendChild(bar);

  function setMinimised(on) {
    document.body.classList.toggle('minimized', on);
    // inert keeps the collapsed panels out of tab order and the a11y tree;
    // they are still in the layout, only transformed.
    for (const p of panels) { p.inert = on; p.setAttribute('aria-hidden', String(on)); }
    bar.inert = !on;
    (on ? dock : btn).focus({ preventScroll: true });
    if (on) document.dispatchEvent(new CustomEvent('appminimize'));
  }

  btn.addEventListener('click', () => setMinimised(true));
  dock.addEventListener('click', () => setMinimised(false));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('minimized')) {
      e.preventDefault();
      setMinimised(false);
    }
  });

  bar.inert = true;
})();
