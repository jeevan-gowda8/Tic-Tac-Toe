/* ═══════════════════════════════════════════════════════════
   Tic-Tac-Toe — Ultimate Tic-Tac-Toe  |  game.js
═══════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
let gridSize   = 3;
let winLen     = 3;
let board      = [];
let history    = [];   // move stack for undo
let current    = 'X';
let alive      = false;
let mode       = 'pvp';
let timerMax   = 0;
let timerLeft  = 0;
let timerTick  = null;
let aiDelay    = null;
let soundOn    = true;
let scores     = { X: 0, O: 0, D: 0 };
let streaks    = { X: 0, O: 0 };
let bestStreak = { X: 0, O: 0 };
let roundNum   = 0;
let isDark     = true;

/* ─────────────────────────────────────────────
   AUDIO ENGINE  (pure WebAudio, no files)
───────────────────────────────────────────── */
let actx = null;
function ac() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  return actx;
}

function tone(freq, type, dur, vol = 0.15, delay = 0) {
  if (!soundOn) return;
  try {
    const ctx = ac(), t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const flt = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    flt.type = 'lowpass';
    flt.frequency.value = 3000;
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(flt).connect(env).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch (_) {}
}

const SFX = {
  placeX()  { tone(380, 'square', 0.1, 0.1); tone(560, 'square', 0.07, 0.06, 0.04); },
  placeO()  { tone(500, 'sine', 0.15, 0.12); tone(750, 'sine', 0.08, 0.07, 0.05); },
  win()     { [523,659,784,988,1047].forEach((f,i) => tone(f,'sine',0.3,0.14,i*0.1)); },
  draw()    { [350,300,260].forEach((f,i) => tone(f,'triangle',0.25,0.1,i*0.12)); },
  undo()    { tone(440,'triangle',0.12,0.1); tone(330,'triangle',0.1,0.08,0.08); },
  click()   { tone(700,'sine',0.05,0.07); },
  timer()   { tone(1000,'square',0.04,0.07); },
  timeout() { [200,180,160].forEach((f,i) => tone(f,'sawtooth',0.2,0.14,i*0.1)); },
};

/* ─────────────────────────────────────────────
   PLASMA CANVAS BACKGROUND
───────────────────────────────────────────── */
const plasma = document.getElementById('plasma-canvas');
const pc     = plasma.getContext('2d');
let pt       = 0;

function resizePlasma() {
  plasma.width  = window.innerWidth;
  plasma.height = window.innerHeight;
}

function drawPlasma() {
  const W = plasma.width, H = plasma.height;
  const img = pc.createImageData(W, H);
  const d   = img.data;
  const t   = pt * 0.012;

  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const nx = x / W, ny = y / H;
      const v =
        Math.sin(nx * 8 + t) +
        Math.sin(ny * 6 + t * 1.3) +
        Math.sin((nx + ny) * 5 + t * 0.7) +
        Math.sin(Math.sqrt((nx - 0.5) * (nx - 0.5) + (ny - 0.5) * (ny - 0.5)) * 12 - t * 1.1);

      const n  = (v + 4) / 8;
      const r  = Math.floor(Math.sin(n * Math.PI * 2 + t) * 40 + 30);
      const g  = Math.floor(Math.sin(n * Math.PI * 2 + t + 2.1) * 20 + 10);
      const b  = Math.floor(Math.sin(n * Math.PI * 2 + t + 4.2) * 60 + 80);
      const a  = Math.floor(n * 80 + 30);

      for (let dy = 0; dy < 3 && y + dy < H; dy++) {
        for (let dx = 0; dx < 3 && x + dx < W; dx++) {
          const idx = ((y + dy) * W + (x + dx)) * 4;
          d[idx]     = r;
          d[idx + 1] = g;
          d[idx + 2] = b;
          d[idx + 3] = a;
        }
      }
    }
  }

  pc.putImageData(img, 0, 0);
  pt++;
  requestAnimationFrame(drawPlasma);
}

window.addEventListener('resize', resizePlasma);
resizePlasma();
drawPlasma();

/* ─────────────────────────────────────────────
   MOUSE GLOW on cells
───────────────────────────────────────────── */
document.addEventListener('mousemove', e => {
  document.querySelectorAll('.cell:not(.taken)').forEach(cell => {
    const r   = cell.getBoundingClientRect();
    const mx  = ((e.clientX - r.left) / r.width  * 100).toFixed(1);
    const my  = ((e.clientY - r.top)  / r.height * 100).toFixed(1);
    cell.style.setProperty('--mx', mx + '%');
    cell.style.setProperty('--my', my + '%');
  });
});

/* ─────────────────────────────────────────────
   WIN COMBOS
───────────────────────────────────────────── */
function combos() {
  const arr = [], n = gridSize, w = winLen;
  for (let r = 0; r < n; r++)
    for (let c = 0; c <= n - w; c++)
      arr.push(Array.from({length: w}, (_, i) => r * n + c + i));
  for (let c = 0; c < n; c++)
    for (let r = 0; r <= n - w; r++)
      arr.push(Array.from({length: w}, (_, i) => (r + i) * n + c));
  for (let r = 0; r <= n - w; r++)
    for (let c = 0; c <= n - w; c++)
      arr.push(Array.from({length: w}, (_, i) => (r + i) * n + c + i));
  for (let r = 0; r <= n - w; r++)
    for (let c = w - 1; c < n; c++)
      arr.push(Array.from({length: w}, (_, i) => (r + i) * n + c - i));
  return arr;
}

function checkWin(player, b = board) {
  for (const combo of combos())
    if (combo.every(i => b[i] === player)) return combo;
  return null;
}

/* ─────────────────────────────────────────────
   INIT & BUILD BOARD
───────────────────────────────────────────── */
function init() {
  board   = Array(gridSize * gridSize).fill(null);
  history = [];
  current = 'X';
  alive   = true;
  stopTimer();
  buildBoard();
  refreshUI();
  updateUndoState();
  if (timerMax > 0) startTimer();
}

function buildBoard() {
  const el = document.getElementById('board');
  el.innerHTML = '';
  el.className = 'board-grid';
  document.querySelectorAll('.win-line-svg').forEach(e => e.remove());

  const cs = `clamp(${Math.floor(280/gridSize)}px, ${Math.floor(66/gridSize)}vw, ${Math.floor(420/gridSize)}px)`;
  el.style.gridTemplateColumns = `repeat(${gridSize}, ${cs})`;

  for (let i = 0; i < gridSize * gridSize; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.i = i;
    cell.style.width  = cs;
    cell.style.height = cs;

    // Number hint
    const num = document.createElement('div');
    num.className = 'cell-num';
    num.textContent = i + 1;
    cell.appendChild(num);

    // Hover preview
    const prev = document.createElement('div');
    prev.className = 'cell-preview';
    prev.textContent = current;
    prev.style.fontSize = `calc(${cs} * 0.38)`;
    prev.style.color = 'var(--x)';
    cell.appendChild(prev);

    cell.addEventListener('click', () => handleClick(i));
    el.appendChild(cell);
  }
}

/* ─────────────────────────────────────────────
   UI REFRESH
───────────────────────────────────────────── */
function refreshUI() {
  const xPanel = document.getElementById('panel-x');
  const oPanel = document.getElementById('panel-o');

  if (alive) {
    xPanel.classList.toggle('active', current === 'X');
    oPanel.classList.toggle('active', current === 'O');
  }

  // Update preview marks on empty cells
  const xColor = 'var(--x)', oColor = 'var(--o)';
  document.querySelectorAll('.cell:not(.taken) .cell-preview').forEach(p => {
    p.textContent  = current;
    p.style.color  = current === 'X' ? xColor : oColor;
  });

  // Board class for corner animation
  const bg = document.getElementById('board');
  bg.classList.toggle('x-turn-board', current === 'X' && alive);
  bg.classList.toggle('o-turn-board', current === 'O' && alive);

  // Status
  if (alive) {
    const name = pName(current);
    setStatus(
      `${current === 'X' ? '✕' : '○'} ${name}'s Turn`,
      current === 'X' ? 'x-turn' : 'o-turn',
      current === 'X' ? 'x-ind' : 'o-ind'
    );
  }

  // Round badge
  document.getElementById('round-disp').textContent = roundNum ? `RD ${roundNum}` : 'RD —';
}

function setStatus(text, textCls, indCls) {
  const t = document.getElementById('status-text');
  const d = document.getElementById('status-indicator');
  t.textContent = text;
  t.className   = `status-text ${textCls || ''}`;
  d.className   = `status-indicator ${indCls || ''}`;
}

function pName(p) {
  const val = document.getElementById(p === 'X' ? 'name-x' : 'name-o').value.trim();
  if (val) return val;
  if (p === 'O' && mode !== 'pvp') return 'AI';
  return p === 'X' ? 'Player 1' : 'Player 2';
}

function syncDisplayNames() {
  document.getElementById('disp-x').textContent = pName('X');
  document.getElementById('disp-o').textContent = pName('O');
  document.getElementById('name-o').placeholder = mode === 'pvp' ? 'Player 2' : 'AI';
}

function updateUndoState() {
  const btn = document.getElementById('undo-btn');
  const dis  = history.length === 0 || !alive;
  btn.disabled = dis;
}

/* ─────────────────────────────────────────────
   TIMER
───────────────────────────────────────────── */
const CIRCUM = 2 * Math.PI * 20; // r=20

function startTimer() {
  if (!timerMax) return;
  timerLeft = timerMax;
  const ring   = document.getElementById('timer-ring');
  const fill   = document.getElementById('tr-fill');
  const num    = document.getElementById('tr-num');
  ring.style.display = 'flex';
  fill.classList.remove('urgent');

  const tick = () => {
    num.textContent = timerLeft;
    const ratio     = timerLeft / timerMax;
    fill.style.strokeDashoffset = CIRCUM * (1 - ratio);
    if (timerLeft <= 5 && timerLeft > 0) { fill.classList.add('urgent'); SFX.timer(); }
    if (timerLeft <= 0) { clearInterval(timerTick); timerTick = null; onTimeout(); return; }
    timerLeft--;
  };

  clearInterval(timerTick);
  tick();
  timerTick = setInterval(tick, 1000);
}

function stopTimer() {
  clearInterval(timerTick);
  timerTick = null;
  const ring = document.getElementById('timer-ring');
  if (!timerMax) { ring.style.display = 'none'; return; }
  const fill = document.getElementById('tr-fill');
  fill.style.strokeDashoffset = 0;
  fill.classList.remove('urgent');
  document.getElementById('tr-num').textContent = timerMax;
}

function onTimeout() {
  if (!alive) return;
  SFX.timeout();
  const loser = current;
  const winner = loser === 'X' ? 'O' : 'X';
  setStatus(`⏱ ${pName(loser)} timed out!`, 'win-' + winner.toLowerCase(), 'win-ind');
  setTimeout(() => endGame('win', winner, null, true), 900);
}

/* ─────────────────────────────────────────────
   GAMEPLAY
───────────────────────────────────────────── */
function handleClick(i) {
  if (!alive || board[i]) return;
  if (mode !== 'pvp' && current === 'O') return;
  place(i, current);
}

function place(i, player) {
  board[i] = player;
  history.push({ i, player });
  updateUndoState();

  renderMark(i, player);
  player === 'X' ? SFX.placeX() : SFX.placeO();

  const win = checkWin(player);
  if (win) {
    stopTimer();
    endGame('win', player, win);
  } else if (board.every(Boolean)) {
    stopTimer();
    endGame('draw');
  } else {
    current = player === 'X' ? 'O' : 'X';
    refreshUI();
    if (timerMax > 0) startTimer();
    if (mode !== 'pvp' && current === 'O' && alive) {
      stopTimer();
      triggerAI();
    }
  }
}

function renderMark(i, player) {
  const cell = document.querySelector(`.cell[data-i="${i}"]`);
  cell.classList.add('taken');
  cell.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'mark-wrap';

  if (player === 'X') {
    wrap.innerHTML = `<svg viewBox="0 0 80 80"><path class="x-path" d="M16 16 L64 64 M64 16 L16 64"/></svg>`;
  } else {
    wrap.innerHTML = `<svg viewBox="0 0 80 80"><circle class="o-circle" cx="40" cy="40" r="26"/></svg>`;
  }

  // Ripple effect
  const ripple = document.createElement('div');
  ripple.style.cssText = `
    position:absolute;inset:0;border-radius:14px;
    background:radial-gradient(circle,${player==='X'?'rgba(255,45,85,0.2)':'rgba(0,212,255,0.2)'} 0%,transparent 70%);
    animation:rippleOut 0.5s ease forwards;pointer-events:none;z-index:0;
  `;
  cell.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);

  cell.appendChild(wrap);
}

/* ─────────────────────────────────────────────
   UNDO
───────────────────────────────────────────── */
function undoMove() {
  if (!alive || history.length === 0) return;

  // Undo 2 moves in AI mode (AI + player), 1 in PvP
  const steps = (mode !== 'pvp' && history.length >= 2) ? 2 : 1;
  for (let s = 0; s < steps; s++) {
    if (!history.length) break;
    const { i } = history.pop();
    board[i] = null;
    const cell = document.querySelector(`.cell[data-i="${i}"]`);
    cell.classList.remove('taken');
    cell.innerHTML = '';
    // Re-add preview
    const num = document.createElement('div');
    num.className = 'cell-num';
    num.textContent = i + 1;
    const prev = document.createElement('div');
    prev.className = 'cell-preview';
    cell.appendChild(num);
    cell.appendChild(prev);
  }

  // Recalc current player
  current = history.length ? (history[history.length-1].player === 'X' ? 'O' : 'X') : 'X';

  SFX.undo();
  stopTimer();
  refreshUI();
  updateUndoState();
  if (timerMax > 0 && alive) startTimer();
}

/* ─────────────────────────────────────────────
   GAME OVER
───────────────────────────────────────────── */
function endGame(result, winner, winCombo, timeout = false) {
  alive = false;
  clearTimeout(aiDelay);
  document.getElementById('ai-pill').classList.remove('visible');
  document.getElementById('panel-x').classList.remove('active');
  document.getElementById('panel-o').classList.remove('active');
  stopTimer();

  const boardEl = document.getElementById('board');

  if (result === 'win') {
    scores[winner]++;
    streaks[winner]++;
    streaks[winner === 'X' ? 'O' : 'X'] = 0;
    bestStreak[winner] = Math.max(bestStreak[winner], streaks[winner]);
    roundNum++;

    // Animate score
    const scoreEl = document.getElementById(`score-${winner.toLowerCase()}`);
    scoreEl.textContent = scores[winner];
    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('bump');

    document.getElementById('round-disp').textContent = `RD ${roundNum}`;

    updateStreakDots();
    syncDisplayNames();
    updateStats();

    const wName = pName(winner);
    setStatus(
      `🏆 ${wName} wins!`,
      `win-${winner.toLowerCase()}`,
      'win-ind'
    );

    if (winCombo) {
      boardEl.classList.add('won');
      winCombo.forEach(idx => {
        const c = document.querySelector(`.cell[data-i="${idx}"]`);
        c.classList.add('win-cell', `${winner.toLowerCase()}-win`);
      });
      drawWinLine(winCombo, winner);
    }

    SFX.win();
    burst(winner);
    const snapText = `${scores.X} — ${scores.O}`;
    const sub = timeout
      ? `${pName(winner === 'X' ? 'O' : 'X')} timed out`
      : ['Flawless!','Excellent!','Unstoppable!','Dominant!'][Math.floor(Math.random()*4)];

    setTimeout(() => showModal(
      winner === 'X' ? '🔥' : '⚡',
      `${wName} Wins!`,
      sub,
      snapText,
      winner
    ), 600);

    addLog(`Round ${roundNum}: ${winner==='X'?'✕':'○'} ${wName} wins!`, 'l'+winner.toLowerCase());
  } else {
    scores.D++;
    roundNum++;
    document.getElementById('draws').textContent = scores.D;
    document.getElementById('round-disp').textContent = `RD ${roundNum}`;
    streaks.X = streaks.O = 0;
    updateStreakDots();
    updateStats();

    setStatus('🤝 Draw — Equal Power!', 'draw', 'draw-ind');
    SFX.draw();

    setTimeout(() => showModal(
      '🤝',
      "It's a Draw!",
      'Evenly matched warriors',
      `${scores.X} — ${scores.O}`,
      null
    ), 600);

    addLog(`Round ${roundNum}: Draw 🤝`, 'ld');
  }
}

/* ─────────────────────────────────────────────
   WIN LINE
───────────────────────────────────────────── */
function drawWinLine(combo, player) {
  const wrap    = document.getElementById('board-stage');
  const boardEl = document.getElementById('board');
  const br      = boardEl.getBoundingClientRect();
  const wr      = wrap.getBoundingClientRect();

  const cells = combo.map(i => document.querySelector(`.cell[data-i="${i}"]`));
  const first = cells[0].getBoundingClientRect();
  const last  = cells[cells.length - 1].getBoundingClientRect();

  const x1 = first.left + first.width  / 2 - wr.left;
  const y1 = first.top  + first.height / 2 - wr.top;
  const x2 = last.left  + last.width   / 2 - wr.left;
  const y2 = last.top   + last.height  / 2 - wr.top;

  const W = wr.width, H = wr.height;
  const len = Math.hypot(x2 - x1, y2 - y1) + 16;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('win-line-svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width',  W);
  svg.setAttribute('height', H);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1); line.setAttribute('y1', y1);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  line.classList.add('win-stroke', `win-stroke-${player.toLowerCase()}`);
  line.style.strokeDasharray  = len;
  line.style.strokeDashoffset = len;

  svg.appendChild(line);
  wrap.appendChild(svg);
  svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:30;overflow:visible;';
}

/* ─────────────────────────────────────────────
   STREAK DOTS
───────────────────────────────────────────── */
function updateStreakDots() {
  ['X','O'].forEach(p => {
    const bar   = document.getElementById(`streak-${p.toLowerCase()}`);
    bar.innerHTML = '';
    const n = Math.min(streaks[p], 6);
    for (let i = 0; i < n; i++) {
      const dot = document.createElement('div');
      dot.className = `sdot sdot-${p.toLowerCase()}`;
      dot.style.animationDelay = `${i * 0.07}s`;
      bar.appendChild(dot);
    }
  });
}

/* ─────────────────────────────────────────────
   CONFETTI BURST
───────────────────────────────────────────── */
function burst(winner) {
  const palettes = {
    X: ['#ff2d55','#ff6b6b','#ff9f43','#ffd43b','#ff8fab'],
    O: ['#00d4ff','#74c7ec','#4ade80','#34d399','#67e8f9'],
  };
  const colors = palettes[winner] || palettes.X;

  for (let i = 0; i < 100; i++) {
    setTimeout(() => {
      const p    = document.createElement('div');
      const sz   = 5 + Math.random() * 10;
      const dur  = 1.8 + Math.random() * 1.8;
      const x    = Math.random() * 100;
      const rot  = Math.random() * 360;
      const col  = colors[Math.floor(Math.random() * colors.length)];
      const isCirc = Math.random() > 0.6;
      p.className = 'confetti-piece';
      p.style.cssText = `
        left:${x}vw;width:${sz}px;height:${sz * (isCirc ? 1 : 0.5 + Math.random())}px;
        background:${col};transform:rotate(${rot}deg);
        --dur:${dur}s;--br:${isCirc ? '50%' : '2px'};
        border-radius:${isCirc ? '50%' : '2px'};
        box-shadow:0 0 4px ${col};
      `;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), dur * 1000 + 100);
    }, i * 20);
  }
}

/* ─────────────────────────────────────────────
   MODAL
───────────────────────────────────────────── */
function showModal(emoji, title, sub, snap, winner) {
  document.getElementById('modal-trophy').textContent = emoji;
  document.getElementById('modal-winner').textContent = title;
  document.getElementById('modal-sub').textContent    = sub;
  document.getElementById('modal-snap').textContent   = snap;

  const box = document.getElementById('modal-box');
  const fx  = document.getElementById('modal-fx');
  box.style.borderColor = winner === 'X' ? 'rgba(255,45,85,0.4)'
    : winner === 'O' ? 'rgba(0,212,255,0.4)' : 'var(--border2)';

  if (winner === 'X') {
    fx.style.background = 'radial-gradient(ellipse at top, rgba(255,45,85,0.12) 0%, transparent 60%)';
    box.style.boxShadow = '0 40px 100px rgba(0,0,0,0.6), 0 0 60px rgba(255,45,85,0.15)';
  } else if (winner === 'O') {
    fx.style.background = 'radial-gradient(ellipse at top, rgba(0,212,255,0.12) 0%, transparent 60%)';
    box.style.boxShadow = '0 40px 100px rgba(0,0,0,0.6), 0 0 60px rgba(0,212,255,0.15)';
  } else {
    fx.style.background = 'none';
  }

  document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

function handleBackdropClick(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}

/* ─────────────────────────────────────────────
   STATS DRAWER
───────────────────────────────────────────── */
function openStats() {
  updateStats();
  document.getElementById('stats-drawer').classList.add('open');
  document.getElementById('drawer-bg').classList.add('open');
}

function closeStats() {
  document.getElementById('stats-drawer').classList.remove('open');
  document.getElementById('drawer-bg').classList.remove('open');
}

function updateStats() {
  const total = scores.X + scores.O + scores.D;
  document.getElementById('stat-rounds').textContent  = total;
  document.getElementById('stat-xrate').textContent   = total ? Math.round(scores.X / total * 100) + '%' : '—';
  document.getElementById('stat-orate').textContent   = total ? Math.round(scores.O / total * 100) + '%' : '—';
  document.getElementById('stat-drate').textContent   = total ? Math.round(scores.D / total * 100) + '%' : '—';
  document.getElementById('stat-xstreak').textContent = bestStreak.X;
  document.getElementById('stat-ostreak').textContent = bestStreak.O;
}

/* ─────────────────────────────────────────────
   MATCH LOG
───────────────────────────────────────────── */
function addLog(text, cls) {
  const list = document.getElementById('log-list');
  const empty = list.querySelector('.log-empty');
  if (empty) empty.remove();

  const now  = new Date();
  const t    = now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  const entry = document.createElement('div');
  entry.className = `log-entry ${cls}`;
  entry.innerHTML = `<span>${text}</span><span class="log-time">${t}</span>`;
  list.insertBefore(entry, list.firstChild);
}

function clearLog() {
  document.getElementById('log-list').innerHTML =
    '<div class="log-empty">No matches played yet. Make your first move!</div>';
}

/* ─────────────────────────────────────────────
   AI LOGIC
───────────────────────────────────────────── */
function triggerAI() {
  const delays = { easy: 750, medium: 500, hard: 380 };
  document.getElementById('ai-pill').classList.add('visible');
  aiDelay = setTimeout(() => {
    document.getElementById('ai-pill').classList.remove('visible');
    if (!alive) return;
    const mv = getAIMove();
    if (mv !== -1) place(mv, 'O');
    if (timerMax > 0 && alive) startTimer();
  }, delays[mode] || 500);
}

function getAIMove() {
  if (mode === 'easy')   return aiEasy();
  if (mode === 'medium') return aiMed();
  return aiHard();
}

function emptySquares(b = board) {
  return b.map((v, i) => v === null ? i : -1).filter(i => i !== -1);
}

function aiEasy() {
  const emp = emptySquares();
  return emp.length ? emp[Math.floor(Math.random() * emp.length)] : -1;
}

function aiMed() {
  let mv = threat('O'); if (mv !== -1) return mv;
  mv = threat('X');     if (mv !== -1) return mv;
  const center = Math.floor(gridSize / 2) * gridSize + Math.floor(gridSize / 2);
  if (!board[center]) return center;
  return aiEasy();
}

function threat(player, b = board) {
  for (const combo of combos()) {
    const has  = combo.filter(i => b[i] === player).length;
    const free = combo.filter(i => !b[i]);
    if (has === winLen - 1 && free.length === 1) return free[0];
  }
  return -1;
}

function aiHard() {
  if (gridSize === 3) return minimax3();
  return aiHardHeuristic();
}

/* Full minimax for 3×3 */
function minimax3() {
  let bestScore = -Infinity, bestMove = -1;
  board.forEach((v, i) => {
    if (v) return;
    board[i] = 'O';
    const s = mm(board.slice(), 0, false, -Infinity, Infinity);
    board[i] = null;
    if (s > bestScore) { bestScore = s; bestMove = i; }
  });
  return bestMove;
}

function mm(b, depth, isMax, alpha, beta) {
  if (checkWin('O', b)) return 10 - depth;
  if (checkWin('X', b)) return depth - 10;
  if (b.every(Boolean))  return 0;

  const emp = emptySquares(b);
  if (isMax) {
    let best = -Infinity;
    for (const i of emp) {
      b[i] = 'O';
      best  = Math.max(best, mm(b, depth + 1, false, alpha, beta));
      b[i]  = null;
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const i of emp) {
      b[i] = 'X';
      best  = Math.min(best, mm(b, depth + 1, true, alpha, beta));
      b[i]  = null;
      beta  = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/* Heuristic for 4×4 / 5×5 */
function aiHardHeuristic() {
  let mv = threat('O'); if (mv !== -1) return mv;
  mv = threat('X');     if (mv !== -1) return mv;

  // Score all empty cells
  const scored = board.map((v, i) => v !== null ? -Infinity : cellHeuristic(i));
  const best   = Math.max(...scored);
  const cands  = scored.map((s, i) => s === best ? i : -1).filter(i => i !== -1);
  return cands[Math.floor(Math.random() * cands.length)];
}

function cellHeuristic(idx) {
  let score = 0;
  for (const combo of combos()) {
    if (!combo.includes(idx)) continue;
    const oCount = combo.filter(i => board[i] === 'O').length;
    const xCount = combo.filter(i => board[i] === 'X').length;
    const free   = combo.filter(i => !board[i]).length;
    if (xCount === 0 && free + oCount === winLen) score += Math.pow(4, oCount);
    if (oCount === 0 && free + xCount === winLen) score += Math.pow(3, xCount) * 0.8;
  }
  const cx   = Math.floor(gridSize / 2);
  const r    = Math.floor(idx / gridSize);
  const c    = idx % gridSize;
  score += Math.max(0, 4 - Math.abs(r - cx) - Math.abs(c - cx));
  return score;
}

/* ─────────────────────────────────────────────
   RESET / CONTROLS
───────────────────────────────────────────── */
function resetGame() {
  clearTimeout(aiDelay);
  document.getElementById('ai-pill').classList.remove('visible');
  document.querySelectorAll('.win-line-svg').forEach(e => e.remove());
  syncDisplayNames();
  init();
}

function resetAll() {
  scores     = { X: 0, O: 0, D: 0 };
  streaks    = { X: 0, O: 0 };
  bestStreak = { X: 0, O: 0 };
  roundNum   = 0;
  document.getElementById('score-x').textContent = '0';
  document.getElementById('score-o').textContent = '0';
  document.getElementById('draws').textContent   = '0';
  document.getElementById('streak-x').innerHTML  = '';
  document.getElementById('streak-o').innerHTML  = '';
  clearLog();
  updateStats();
  resetGame();
}

/* ─────────────────────────────────────────────
   CHIP GROUPS SETUP
───────────────────────────────────────────── */
function setupChips(groupId, cb) {
  document.getElementById(groupId).addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    SFX.click();
    document.querySelectorAll(`#${groupId} .chip`).forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    cb(chip);
  });
}

setupChips('mode-chips', chip => {
  mode = chip.dataset.mode;
  syncDisplayNames();
  resetAll();
});

setupChips('grid-chips', chip => {
  gridSize = parseInt(chip.dataset.size);
  winLen   = gridSize === 5 ? 4 : 3;
  resetAll();
});

setupChips('timer-chips', chip => {
  timerMax = parseInt(chip.dataset.timer);
  stopTimer();
  resetGame();
});

/* ─────────────────────────────────────────────
   NAV BUTTONS
───────────────────────────────────────────── */
document.getElementById('btn-sound').addEventListener('click', () => {
  soundOn = !soundOn;
  const btn = document.getElementById('btn-sound');
  btn.style.color = soundOn ? '' : 'var(--x)';
  if (soundOn) SFX.click();
});

document.getElementById('btn-theme').addEventListener('click', () => {
  SFX.click();
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  const btn = document.getElementById('btn-theme');
  btn.querySelector('svg').innerHTML = isDark
    ? `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`
    : `<circle cx="12" cy="12" r="5"/>
       <line x1="12" y1="1" x2="12" y2="3"/>
       <line x1="12" y1="21" x2="12" y2="23"/>
       <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
       <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
       <line x1="1" y1="12" x2="3" y2="12"/>
       <line x1="21" y1="12" x2="23" y2="12"/>
       <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
       <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
});

document.getElementById('btn-stats').addEventListener('click', () => {
  SFX.click();
  openStats();
});

/* ─────────────────────────────────────────────
   NAME INPUTS
───────────────────────────────────────────── */
document.getElementById('name-x').addEventListener('input', syncDisplayNames);
document.getElementById('name-o').addEventListener('input', syncDisplayNames);

/* ─────────────────────────────────────────────
   KEYBOARD SHORTCUTS
───────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undoMove(); }
  if (e.key === 'n' || e.key === 'N') resetGame();
  if (e.key === 'Escape') { closeModal(); closeStats(); }
});

/* ─────────────────────────────────────────────
   RIPPLE KEYFRAME (injected)
───────────────────────────────────────────── */
const style = document.createElement('style');
style.textContent = `
  @keyframes rippleOut {
    0%   { opacity: 0.6; transform: scale(0.5); }
    100% { opacity: 0; transform: scale(1.5); }
  }
`;
document.head.appendChild(style);

/* ─────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */
syncDisplayNames();
init();