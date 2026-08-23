/* Tetris — Soviets greatest game
   Follows the Tetris Guideline where it affects how the game feels:
   SRS rotation with the real kick tables, 0.5s lock delay with move reset,
   hold, 7-bag randomisation, the Tetris Worlds gravity curve, and
   T-spin / back-to-back / combo scoring. The next queue is one piece
   rather than six, deliberately. */
(() => {
  'use strict';

  const COLS = 10, ROWS = 20;
  const LOCK_MS = 500;        // guideline lock delay
  const MAX_LOCK_RESETS = 15; // extended placement: 15 moves before it locks anyway
  const FLASH_MS = 280;       // matches the clearflash keyframes in games.css
  const GRAVITY_CAP = 15;     // marathon tops out here; past this, speed holds

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

  /* SRS wall kicks. Offsets are (x, y) with y positive UP, as the spec
     writes them; this grid has y positive down, so y is negated on use.
     Rotation states: 0 spawn, 1 right, 2 flipped, 3 left. */
  const KICKS = {
    '0>1': [[0,0],[-1,0],[-1, 1],[0,-2],[-1,-2]],
    '1>0': [[0,0],[ 1,0],[ 1,-1],[0, 2],[ 1, 2]],
    '1>2': [[0,0],[ 1,0],[ 1,-1],[0, 2],[ 1, 2]],
    '2>1': [[0,0],[-1,0],[-1, 1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[ 1,0],[ 1, 1],[0,-2],[ 1,-2]],
    '3>2': [[0,0],[-1,0],[-1,-1],[0, 2],[-1, 2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0, 2],[-1, 2]],
    '0>3': [[0,0],[ 1,0],[ 1, 1],[0,-2],[ 1,-2]],
  };
  const KICKS_I = {
    '0>1': [[0,0],[-2,0],[ 1,0],[-2,-1],[ 1, 2]],
    '1>0': [[0,0],[ 2,0],[-1,0],[ 2, 1],[-1,-2]],
    '1>2': [[0,0],[-1,0],[ 2,0],[-1, 2],[ 2,-1]],
    '2>1': [[0,0],[ 1,0],[-2,0],[ 1,-2],[-2, 1]],
    '2>3': [[0,0],[ 2,0],[-1,0],[ 2, 1],[-1,-2]],
    '3>2': [[0,0],[-2,0],[ 1,0],[-2,-1],[ 1, 2]],
    '3>0': [[0,0],[ 1,0],[-2,0],[ 1,-2],[-2, 1]],
    '0>3': [[0,0],[-1,0],[ 2,0],[-1, 2],[ 2,-1]],
  };

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board'), nextEl = $('next'), holdEl = $('hold');
  const overlay = $('overlay'), msgEl = $('msg');
  const scoreEl = $('score'), bestEl = $('best'), linesEl = $('lines'), levelEl = $('level');

  const readBest = () => { try { return +localStorage.getItem('tetris.best') || 0; } catch { return 0; } };
  const writeBest = (v) => { try { localStorage.setItem('tetris.best', String(v)); } catch {} };

  const mkCells = (parent, n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      parent.appendChild(d);
      out.push(d);
    }
    return out;
  };
  const cells = mkCells(boardEl, COLS * ROWS);
  const nextCells = mkCells(nextEl, 16);
  const holdCells = mkCells(holdEl, 16);

  let grid, cur, nextKind, holdKind, holdUsed;
  let score, lines, level, dropMs, acc, last, lockAcc, lockResets;
  let combo, b2b, spun, lastKick, msgTimer;
  let dead, paused, confirming, waiting, flashing, flashTimer;
  let bag = [], firstBag;

  // ---- randomiser -------------------------------------------------------
  function refillBag() {
    bag = KEYS.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // Guideline: the opening piece is never S, Z or O — those force a hole
    // through no fault of the player. Pieces are drawn from the end.
    if (firstBag) {
      firstBag = false;
      const last = bag.length - 1;
      if ('SZO'.includes(bag[last])) {
        const i = bag.findIndex((k) => !'SZO'.includes(k));
        [bag[last], bag[i]] = [bag[i], bag[last]];
      }
    }
  }
  function drawKind() {
    if (!bag.length) refillBag();
    return bag.pop();
  }

  // ---- geometry ---------------------------------------------------------
  const rotCW = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse());

  function make(kind) {
    const p = PIECES[kind];
    return {
      k: kind, c: p.c, r: 0,
      m: p.m.map((r) => r.slice()),
      x: Math.floor((COLS - p.m.length) / 2),
      y: kind === 'I' ? -1 : 0,
    };
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
  const grounded = () => hits(cur.m, cur.x, cur.y + 1);

  function spawn(kind) {
    cur = make(kind === undefined ? nextKind : kind);
    if (kind === undefined) nextKind = drawKind();
    lockAcc = 0; lockResets = 0; spun = false; lastKick = 0;
    if (hits(cur.m, cur.x, cur.y)) gameOver();
  }

  // Any successful move or rotation refreshes the lock timer, up to a cap —
  // otherwise you could stall a piece on the stack forever.
  function touched() {
    if (grounded() && lockResets < MAX_LOCK_RESETS) { lockAcc = 0; lockResets++; }
  }

  function move(dx) {
    if (hits(cur.m, cur.x + dx, cur.y)) return false;
    cur.x += dx; spun = false; touched(); return true;
  }

  function rotate(dir) {
    if (cur.k === 'O') return false;
    const from = cur.r, to = (from + (dir > 0 ? 1 : 3)) % 4;
    let m = cur.m;
    for (let i = 0; i < (dir > 0 ? 1 : 3); i++) m = rotCW(m);
    const table = (cur.k === 'I' ? KICKS_I : KICKS)[from + '>' + to];
    for (let i = 0; i < table.length; i++) {
      const dx = table[i][0], dy = -table[i][1];   // spec y is up, grid y is down
      if (hits(m, cur.x + dx, cur.y + dy)) continue;
      cur.m = m; cur.x += dx; cur.y += dy; cur.r = to;
      spun = true; lastKick = i; touched();
      return true;
    }
    return false;
  }

  function softDrop() {
    if (grounded()) return false;
    cur.y++; score += 1; lockResets = 0; spun = false;
    return true;
  }

  function hardDrop() {
    while (!grounded()) { cur.y++; score += 2; }
    spun = false;
    lock();                       // hard drop locks immediately
  }

  function holdSwap() {
    if (holdUsed) return;
    holdUsed = true;
    const outgoing = cur.k;
    if (holdKind) { const incoming = holdKind; holdKind = outgoing; spawn(incoming); }
    else { holdKind = outgoing; spawn(); }
    drawHold();
  }

  // ---- T-spin detection (3-corner rule) ---------------------------------
  const solid = (x, y) =>
    x < 0 || x >= COLS || y >= ROWS ? true : (y < 0 ? false : !!grid[y][x]);

  function spinType() {
    if (cur.k !== 'T' || !spun) return null;
    // corners of the 3x3 box: 0 TL, 1 TR, 2 BR, 3 BL
    const c = [solid(cur.x, cur.y), solid(cur.x + 2, cur.y),
               solid(cur.x + 2, cur.y + 2), solid(cur.x, cur.y + 2)];
    if (c.filter(Boolean).length < 3) return null;
    // the two corners the T points toward, per rotation state
    const FRONT = [[0, 1], [1, 2], [2, 3], [3, 0]][cur.r];
    if (c[FRONT[0]] && c[FRONT[1]]) return 'tspin';
    return lastKick === 4 ? 'tspin' : 'mini';   // the last kick promotes a mini
  }

  // ---- locking and scoring ----------------------------------------------
  function lock() {
    const spin = spinType();
    for (let y = 0; y < cur.m.length; y++)
      for (let x = 0; x < cur.m.length; x++) {
        if (!cur.m[y][x]) continue;
        const gy = cur.y + y;
        if (gy < 0) { gameOver(); return; }
        grid[gy][cur.x + x] = cur.c;
      }
    holdUsed = false;
    const full = [];
    for (let y = 0; y < ROWS; y++) if (grid[y].every(Boolean)) full.push(y);
    award(full.length, spin);
    if (full.length) flashRows(full);
    else spawn();
  }

  function award(cleared, spin) {
    const difficult = cleared === 4 || (!!spin && cleared > 0);
    let base;
    if (spin === 'tspin')     base = [400, 800, 1200, 1600][cleared];
    else if (spin === 'mini') base = [100, 200, 400, 400][cleared];
    else                      base = [0, 100, 300, 500, 800][cleared];

    let pts = base * level;
    const chained = difficult && b2b;
    if (chained) pts = Math.floor(pts * 1.5);

    if (cleared > 0) {
      combo++;
      if (combo > 0) pts += 50 * combo * level;
      b2b = difficult;
    } else {
      combo = -1;                 // a placement with no clear breaks the combo
    }
    score += pts;

    const label =
      spin === 'tspin' ? 't-spin ' + ['', 'single', 'double', 'triple'][cleared]
      : spin === 'mini' ? 't-spin mini ' + ['', 'single', 'double'][cleared]
      : cleared === 4 ? 'tetris'
      : '';
    const parts = [];
    if (label) parts.push(label.trim());
    if (chained) parts.push('b2b');
    if (combo > 0) parts.push('combo ' + combo);
    if (parts.length) flash(parts.join(' · '));
  }

  function flash(text) {
    msgEl.textContent = text;
    msgEl.classList.add('show');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => msgEl.classList.remove('show'), 900);
  }

  function flashRows(rows) {
    flashing = true;
    draw();
    for (const y of rows)
      for (let x = 0; x < COLS; x++) cells[y * COLS + x].className = 'cell clearing';
    flashTimer = setTimeout(() => {
      // ascending order: splicing a row only shifts the rows above it
      for (const y of rows) {
        grid.splice(y, 1);
        grid.unshift(new Array(COLS).fill(0));
      }
      lines += rows.length;
      setLevel(Math.floor(lines / 10) + 1);
      flashing = false;
      if (!dead) { spawn(); draw(); }
    }, FLASH_MS);
  }

  // Tetris Worlds curve: seconds per row = (0.8 - (lvl-1)*0.007) ^ (lvl-1)
  function setLevel(lv) {
    level = lv;
    const g = Math.min(lv, GRAVITY_CAP);
    dropMs = Math.pow(0.8 - (g - 1) * 0.007, g - 1) * 1000;
  }

  // ---- rendering ---------------------------------------------------------
  function paintMini(target, kind) {
    for (const c of target) c.className = 'cell';
    if (!kind) return;
    const m = PIECES[kind].m, off = m.length === 4 ? 0 : 1;
    for (let y = 0; y < m.length; y++)
      for (let x = 0; x < m.length; x++)
        if (m[y][x] && y + off < 4 && x + off < 4)
          target[(y + off) * 4 + x + off].className = 'cell f ' + PIECES[kind].c;
  }
  const drawHold = () => paintMini(holdCells, holdKind);

  function paint(m, px, py, cls) {
    for (let y = 0; y < m.length; y++)
      for (let x = 0; x < m.length; x++) {
        if (!m[y][x]) continue;
        const gy = py + y, gx = px + x;
        if (gy < 0 || gy >= ROWS || gx < 0 || gx >= COLS) continue;
        cells[gy * COLS + gx].className = 'cell ' + cls;
      }
  }

  function draw() {
    for (let i = 0; i < cells.length; i++) {
      const c = grid[(i / COLS) | 0][i % COLS];
      cells[i].className = c ? 'cell f ' + c : 'cell';
    }
    if (!dead) {
      let gy = cur.y;
      while (!hits(cur.m, cur.x, gy + 1)) gy++;
      paint(cur.m, cur.x, gy, 'ghost');
      paint(cur.m, cur.x, cur.y, 'f ' + cur.c);
    }
    paintMini(nextCells, nextKind);
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    levelEl.textContent = level;
  }

  // ---- screens -----------------------------------------------------------
  function gameOver() {
    dead = true;
    const best = Math.max(score, readBest());
    writeBest(best);
    bestEl.textContent = best;
    overlay.innerHTML = '<p>game over</p><p class="sub">score ' + score +
      '</p><div class="choices"><button id="again" class="btn">play again</button></div>';
    overlay.hidden = false;
    $('again').addEventListener('click', () => reset(true));
  }

  function setPaused(p) {
    if (dead || confirming || waiting) return;
    paused = p;
    if (!p) { overlay.hidden = true; overlay.innerHTML = ''; last = undefined; return; }
    overlay.innerHTML = '<p>paused</p><div class="choices">' +
      '<button id="resume" class="btn">resume</button></div><p class="sub">or press p</p>';
    overlay.hidden = false;
    $('resume').addEventListener('click', () => setPaused(false));
  }

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
    confirming = false; overlay.hidden = true; overlay.innerHTML = ''; last = undefined;
  }

  function showStart() {
    waiting = true;
    for (const el of [$('nextbox'), $('holdbox')]) el.classList.add('off');
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
    for (const el of [$('nextbox'), $('holdbox')]) el.classList.remove('off');
    overlay.hidden = true; overlay.innerHTML = '';
    last = undefined;
    draw();
  }

  function reset(autostart) {
    grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
    score = 0; lines = 0; acc = 0; lockAcc = 0; lockResets = 0;
    combo = -1; b2b = false; spun = false;
    dead = false; paused = false; confirming = false; flashing = false;
    clearTimeout(flashTimer); clearTimeout(msgTimer);
    msgEl.classList.remove('show');
    bag = []; firstBag = true; holdKind = null; holdUsed = false;
    setLevel(1);
    nextKind = drawKind();
    spawn();
    drawHold(); draw();
    overlay.hidden = true; overlay.innerHTML = '';
    bestEl.textContent = readBest();
    if (autostart) start(); else showStart();
  }

  // ---- loop --------------------------------------------------------------
  function loop(t) {
    if (last === undefined) last = t;
    const dt = t - last; last = t;
    if (!dead && !paused && !confirming && !waiting && !flashing) {
      acc += dt;
      let steps = 0;
      while (acc >= dropMs && steps++ < ROWS) {       // cap: 20G shouldn't spin
        acc -= dropMs;
        if (!grounded()) { cur.y++; lockResets = 0; spun = false; }
      }
      if (grounded()) {
        lockAcc += dt;
        if (lockAcc >= LOCK_MS) lock();
      } else {
        lockAcc = 0;
      }
      if (!flashing) draw();
    }
    requestAnimationFrame(loop);
  }

  // ---- input --------------------------------------------------------------
  const ACTIONS = {
    left:  () => move(-1),
    right: () => move(1),
    down:  () => softDrop(),
    rot:   () => rotate(1),
    ccw:   () => rotate(-1),
    drop:  () => hardDrop(),
    hold:  () => holdSwap(),
  };
  function act(name) {
    if (dead || paused || confirming || waiting || flashing) return;
    ACTIONS[name]();
    if (!flashing) draw();
  }

  const KEYMAP = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowUp: 'rot', w: 'rot', W: 'rot', x: 'rot', X: 'rot',
    z: 'ccw', Z: 'ccw',
    c: 'hold', C: 'hold', Shift: 'hold',
    ' ': 'drop',
  };

  addEventListener('keydown', (e) => {
    if (confirming) {
      if (e.key === 'Enter' || e.key === 'y' || e.key === 'Y') {
        e.preventDefault(); confirming = false; reset(true);
      } else if (e.key === 'Escape' || e.key === 'n' || e.key === 'N') {
        e.preventDefault(); cancelRestart();
      }
      return;
    }
    if (waiting) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
      return;
    }
    if (e.key === 'p' || e.key === 'P') { setPaused(!paused); return; }
    if (e.key === 'r' || e.key === 'R') { askRestart(); return; }
    const a = KEYMAP[e.key];
    if (!a) return;
    e.preventDefault();
    act(a);
  });

  document.querySelectorAll('[data-act]').forEach((btn) => {
    let holdT, rep;
    const name = btn.dataset.act;
    const startPress = (e) => {
      e.preventDefault();
      act(name);
      if (name === 'left' || name === 'right' || name === 'down')
        holdT = setTimeout(() => { rep = setInterval(() => act(name), 60); }, 220);
    };
    const stop = () => { clearTimeout(holdT); clearInterval(rep); };
    btn.addEventListener('pointerdown', startPress);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  $('restart').addEventListener('click', askRestart);
  $('pause').addEventListener('click', () => setPaused(!paused));

  addEventListener('blur', () => setPaused(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  reset(false);
  requestAnimationFrame(loop);
})();
