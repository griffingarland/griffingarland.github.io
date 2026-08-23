/* Tetris — plain JS, no dependencies.
   Board is 10x20. Pieces are stored as square matrices and rotated by
   transpose+reverse; wall kicks are a simple offset scan, which is not
   full SRS but behaves the way people expect against walls and floors. */
(() => {
  'use strict';

  const COLS = 10, ROWS = 20;

  const PIECES = {
    I: { c: 'i', m: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
    O: { c: 'o', m: [[1,1],[1,1]] },
    T: { c: 't', m: [[0,1,0],[1,1,1],[0,0,0]] },
    S: { c: 's', m: [[0,1,1],[1,1,0],[0,0,0]] },
    Z: { c: 'z', m: [[1,1,0],[0,1,1],[0,0,0]] },
    J: { c: 'j', m: [[1,0,0],[1,1,1],[0,0,0]] },
    L: { c: 'l', m: [[0,0,1],[1,1,1],[0,0,0]] },
  };
  const KEYS = Object.keys(PIECES);

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board'), nextEl = $('next'), overlay = $('overlay');
  const scoreEl = $('score'), bestEl = $('best'), linesEl = $('lines'), levelEl = $('level');

  // ---- persistent best score (may throw in private mode) ----------------
  const readBest = () => { try { return +localStorage.getItem('tetris.best') || 0; } catch { return 0; } };
  const writeBest = (v) => { try { localStorage.setItem('tetris.best', String(v)); } catch {} };

  // ---- cell pools -------------------------------------------------------
  const cells = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const d = document.createElement('div');
    d.className = 'cell';
    boardEl.appendChild(d);
    cells.push(d);
  }
  const nextCells = [];
  for (let i = 0; i < 16; i++) {
    const d = document.createElement('div');
    d.className = 'cell';
    nextEl.appendChild(d);
    nextCells.push(d);
  }

  let grid, cur, nextPiece, score, lines, level, dropMs, acc, last;
  let dead, paused, confirming, waiting, flashing, flashTimer, bag = [];
  const FLASH_MS = 280;   // matches the clearflash keyframes in games.css

  // 7-bag randomiser: every piece appears once per seven, which is what
  // makes the game feel fair rather than random.
  function nextFromBag() {
    if (!bag.length) {
      bag = KEYS.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    const k = bag.pop();
    return { k, c: PIECES[k].c, m: PIECES[k].m.map(r => r.slice()) };
  }

  function spawn() {
    cur = nextPiece || nextFromBag();
    nextPiece = nextFromBag();
    cur.x = Math.floor((COLS - cur.m.length) / 2);
    cur.y = cur.k === 'I' ? -1 : 0;
    if (hits(cur.m, cur.x, cur.y)) gameOver();
  }

  function hits(m, px, py) {
    for (let y = 0; y < m.length; y++)
      for (let x = 0; x < m.length; x++) {
        if (!m[y][x]) continue;
        const gx = px + x, gy = py + y;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
        if (gy >= 0 && grid[gy][gx]) return true;
      }
    return false;
  }

  const rotated = (m) => m[0].map((_, i) => m.map(r => r[i]).reverse());

  function rotate() {
    if (cur.k === 'O') return;
    const m = rotated(cur.m);
    for (const dx of [0, -1, 1, -2, 2]) {
      if (!hits(m, cur.x + dx, cur.y)) { cur.m = m; cur.x += dx; return; }
    }
  }

  function move(dx) { if (!hits(cur.m, cur.x + dx, cur.y)) cur.x += dx; }

  function softDrop() {
    if (!hits(cur.m, cur.x, cur.y + 1)) { cur.y++; score += 1; return true; }
    lock(); return false;
  }

  function hardDrop() {
    while (!hits(cur.m, cur.x, cur.y + 1)) { cur.y++; score += 2; }
    lock();
  }

  function lock() {
    for (let y = 0; y < cur.m.length; y++)
      for (let x = 0; x < cur.m.length; x++) {
        if (!cur.m[y][x]) continue;
        const gy = cur.y + y;
        if (gy < 0) { gameOver(); return; }
        grid[gy][cur.x + x] = cur.c;
      }
    const full = [];
    for (let y = 0; y < ROWS; y++) if (grid[y].every(Boolean)) full.push(y);
    if (full.length) flashRows(full);
    else spawn();
  }

  // Light the completed rows for a beat before collapsing them, so a clear
  // is something you see rather than something you infer from the score.
  function flashRows(rows) {
    flashing = true;
    draw();
    for (const y of rows)
      for (let x = 0; x < COLS; x++) cells[y * COLS + x].className = 'cell clearing';
    flashTimer = setTimeout(() => {
      // ascending order: splicing a row only shifts the rows above it, so
      // the indices still to be removed stay valid
      for (const y of rows) {
        grid.splice(y, 1);
        grid.unshift(new Array(COLS).fill(0));
      }
      lines += rows.length;
      score += [0, 100, 300, 500, 800][rows.length] * level;
      const lv = Math.floor(lines / 10) + 1;
      if (lv !== level) { level = lv; dropMs = Math.max(90, 800 - (level - 1) * 70); }
      flashing = false;
      if (!dead) { spawn(); draw(); }
    }, FLASH_MS);
  }

  function draw() {
    for (let i = 0; i < cells.length; i++) {
      const c = grid[(i / COLS) | 0][i % COLS];
      cells[i].className = c ? 'cell f ' + c : 'cell';
    }
    if (!dead) {
      // ghost piece: where it would land
      let gy = cur.y;
      while (!hits(cur.m, cur.x, gy + 1)) gy++;
      paint(cur.m, cur.x, gy, 'ghost');
      paint(cur.m, cur.x, cur.y, 'f ' + cur.c);
    }
    for (let i = 0; i < 16; i++) nextCells[i].className = 'cell';
    const m = nextPiece.m, off = m.length === 4 ? 0 : 1;
    for (let y = 0; y < m.length; y++)
      for (let x = 0; x < m.length; x++)
        if (m[y][x] && y + off < 4 && x + off < 4)
          nextCells[(y + off) * 4 + x + off].className = 'cell f ' + nextPiece.c;

    scoreEl.textContent = score;
    linesEl.textContent = lines;
    levelEl.textContent = level;
  }

  function paint(m, px, py, cls) {
    for (let y = 0; y < m.length; y++)
      for (let x = 0; x < m.length; x++) {
        if (!m[y][x]) continue;
        const gy = py + y, gx = px + x;
        if (gy < 0 || gy >= ROWS || gx < 0 || gx >= COLS) continue;
        cells[gy * COLS + gx].className = 'cell ' + cls;
      }
  }

  function gameOver() {
    dead = true;
    const best = Math.max(score, readBest());
    writeBest(best);
    bestEl.textContent = best;
    overlay.innerHTML = '<p>game over</p><p class="sub">score ' + score +
      '</p><button id="again" class="btn">play again</button>';
    overlay.hidden = false;
    $('again').addEventListener('click', () => reset(true));
  }

  function setPaused(p) {
    if (dead || confirming || waiting) return;
    paused = p;
    if (!p) {
      overlay.hidden = true;
      overlay.innerHTML = '';
      last = undefined;        // don't bank the paused time as one big tick
      return;
    }
    overlay.innerHTML =
      '<p>paused</p><div class="choices">' +
      '<button id="resume" class="btn">resume</button></div>' +
      '<p class="sub">or press p</p>';
    overlay.hidden = false;
    $('resume').addEventListener('click', () => setPaused(false));
  }

  // Restarting throws away a game in progress, so it asks first — unless
  // there is nothing to lose yet.
  function askRestart() {
    if (dead) { reset(true); return; }
    if (score === 0 && lines === 0) { reset(true); return; }
    confirming = true;
    overlay.innerHTML =
      '<p>restart?</p><p class="sub">this ends the current game</p>' +
      '<div class="choices"><button id="yes" class="btn">restart</button>' +
      '<button id="no" class="btn">cancel</button></div>' +
      '<p class="sub">enter to confirm &middot; esc to cancel</p>';
    overlay.hidden = false;
    $('yes').addEventListener('click', () => { confirming = false; reset(true); });
    $('no').addEventListener('click', cancelRestart);
    $('no').focus();
  }

  function cancelRestart() {
    confirming = false;
    overlay.hidden = true;
    overlay.innerHTML = '';
    last = undefined;          // don't let the paused time count as one tick
  }

  function showStart() {
    waiting = true;
    // Nothing is in play yet, so hide the whole next slot, label included.
    for (const c of nextCells) c.className = 'cell';
    $('nextbox').classList.add('off');
    overlay.innerHTML =
      '<p>tetris</p><p class="sub">come on, you know how to play</p>' +
      '<div class="choices"><button id="go" class="btn">start</button></div>' +
      '<p class="sub">or press enter</p>';
    overlay.hidden = false;
    $('go').addEventListener('click', start);
    $('go').focus();
  }

  function start() {
    waiting = false;
    $('nextbox').classList.remove('off');
    overlay.hidden = true;
    overlay.innerHTML = '';
    last = undefined;
    draw();      // paint immediately; don't show an empty slot until the first frame
  }

  function reset(autostart) {
    grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
    score = 0; lines = 0; level = 1; dropMs = 800; acc = 0;
    dead = false; paused = false; confirming = false; flashing = false;
    clearTimeout(flashTimer);
    bag = []; nextPiece = null;
    overlay.hidden = true; overlay.innerHTML = '';
    bestEl.textContent = readBest();
    spawn(); draw();
    if (autostart) start(); else showStart();
  }

  function loop(t) {
    if (last === undefined) last = t;
    const dt = t - last; last = t;
    if (!dead && !paused && !confirming && !waiting && !flashing) {
      acc += dt;
      if (acc >= dropMs) { acc = 0; softDrop(); }
      draw();
    }
    requestAnimationFrame(loop);
  }

  // ---- input ------------------------------------------------------------
  const ACTIONS = {
    left:  () => move(-1),
    right: () => move(1),
    down:  () => softDrop(),
    rot:   () => rotate(),
    drop:  () => hardDrop(),
  };

  function act(name) {
    if (dead || paused || confirming || waiting || flashing) return;
    ACTIONS[name]();
    draw();
  }

  const KEYMAP = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowUp: 'rot', w: 'rot', W: 'rot', x: 'rot', X: 'rot',
    ' ': 'drop',
  };

  addEventListener('keydown', (e) => {
    if (confirming) {
      if (e.key === 'Enter' || e.key === 'y' || e.key === 'Y') {
        e.preventDefault(); confirming = false; reset(true);
      } else if (e.key === 'Escape' || e.key === 'n' || e.key === 'N') {
        e.preventDefault(); cancelRestart();
      }
      return;                  // swallow everything else mid-prompt
    }
    if (waiting) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
      return;
    }
    if (e.key === 'p' || e.key === 'P') { setPaused(!paused); return; }
    if (e.key === 'r' || e.key === 'R') { askRestart(); return; }
    const a = KEYMAP[e.key];
    if (!a) return;
    e.preventDefault();          // stop arrows/space scrolling the page
    act(a);
  });

  // On-screen controls: press-and-hold repeats, which is what makes the
  // touch version actually playable.
  document.querySelectorAll('[data-act]').forEach((btn) => {
    let hold, rep;
    const name = btn.dataset.act;
    const start = (e) => {
      e.preventDefault();
      act(name);
      if (name === 'drop' || name === 'rot') return;
      hold = setTimeout(() => { rep = setInterval(() => act(name), 60); }, 220);
    };
    const stop = () => { clearTimeout(hold); clearInterval(rep); };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  $('restart').addEventListener('click', askRestart);
  $('pause').addEventListener('click', () => setPaused(!paused));

  // Don't run the clock in a background tab.
  addEventListener('blur', () => setPaused(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  reset(false);
  requestAnimationFrame(loop);
})();
