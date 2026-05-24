// Armenian keyboard layout. Last row has 9 keys; the 10th cell is left empty
// so columns line up with the 10-key rows above.
const KEYBOARD = [
  ['է', 'թ', 'փ', 'ձ', 'ջ', 'և', 'ր', 'չ', 'ճ', 'ժ'],
  ['ք', 'ո', 'ե', 'ռ', 'տ', 'ը', 'ու', 'ի', 'օ', 'պ'],
  ['ա', 'ս', 'դ', 'ֆ', 'գ', 'հ', 'յ', 'կ', 'լ', 'շ'],
  ['զ', 'ղ', 'ց', 'վ', 'բ', 'ն', 'մ', 'խ', 'ծ'],
];

const SKIPS_BY_MODE = { easy: 4, medium: 2, hard: 0, learning: 2 };
const MAX_LIVES = 14;
const REVEAL_PAUSE_MS = 800;
const LOSE_PAUSE_MS = 1500;

const state = {
  mode: null,
  words: null,
  picker: null,            // ShufflePicker or LearningPicker (see picker.js)
  current: null,
  slots: [],
  lives: MAX_LIVES,
  score: 0,
  skipsUsed: 0,
  maxSkips: 0,
  locked: false,
};

// ---------------------------------------------------------------------------
// Chromecast (Google Cast Web Sender).
//
// The phone stays the controller; only the live gameplay is cast. A compact
// snapshot of the current word / keyboard / lives / score is pushed to a
// custom Web Receiver (receiver.html) on every move. The menu, stats and the
// game-over dialog are NOT cast -- the TV shows an idle splash for those.
//
// Set CAST_APP_ID to the Application ID from the Google Cast SDK Developer
// Console (registered against the hosted receiver.html URL). Until it is set,
// the cast button stays hidden and the game behaves exactly as before.
// ---------------------------------------------------------------------------
const CAST_APP_ID = '498C37EF';
const CAST_NAMESPACE = 'urn:x-cast:com.shtemaran.hangman';

let castContext = null;
let lastSnapshot = null;

// The Cast SDK calls this global the moment the framework finishes loading.
window['__onGCastApiAvailable'] = function (isAvailable) {
  if (isAvailable && CAST_APP_ID !== 'REPLACE_WITH_APP_ID') initCast();
};

function initCast() {
  castContext = cast.framework.CastContext.getInstance();
  castContext.setOptions({
    receiverApplicationId: CAST_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
  });
  // When a TV connects mid-game, push what we're currently showing so it
  // doesn't sit blank until the next keypress.
  castContext.addEventListener(
    cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
    (e) => {
      const S = cast.framework.SessionState;
      if (e.sessionState === S.SESSION_STARTED || e.sessionState === S.SESSION_RESUMED) {
        castDeliver(lastSnapshot || castSnapshot('idle'));
      }
    }
  );
  // Mirror the cast button's visibility onto <body> so the game top bar only
  // reserves corner space for it while a device is actually available.
  const applyCastAvailability = () => {
    const available = castContext.getCastState() !== cast.framework.CastState.NO_DEVICES_AVAILABLE;
    document.body.classList.toggle('cast-available', available);
  };
  castContext.addEventListener(
    cast.framework.CastContextEventType.CAST_STATE_CHANGED,
    applyCastAvailability
  );
  applyCastAvailability();
}

// Letters already played, split into correct guesses (dimmed on the TV) and
// wrong guesses (shown red). Read straight off the rendered keyboard so the
// game logic doesn't need to track guessed letters separately.
function castKeyState() {
  const used = [], wrong = [];
  for (const k of document.querySelectorAll('.key')) {
    if (k.classList.contains('wrong')) wrong.push(k.dataset.letter);
    else if (k.disabled) used.push(k.dataset.letter);
  }
  return { used, wrong };
}

function castSnapshot(phase) {
  const ks = castKeyState();
  return {
    v: 1,
    phase, // 'idle' | 'playing' | 'solved' | 'dead'
    clue: state.current ? state.current.q : '',
    slots: state.slots.map((s) => ({ c: s.char, r: s.revealed })),
    lives: state.lives,
    score: state.score,
    used: ks.used,
    wrong: ks.wrong,
  };
}

function castDeliver(snapshot) {
  if (!castContext) return;
  const session = castContext.getCurrentSession();
  if (!session) return;
  session.sendMessage(CAST_NAMESPACE, snapshot)
    .catch((err) => console.warn('cast sendMessage failed', err));
}

// Build + remember the current snapshot, and deliver it if a TV is connected.
// Safe to call when Cast is unavailable (no SDK / no session) -- it just
// records the snapshot to replay on a later connect.
function castSend(phase) {
  lastSnapshot = castSnapshot(phase);
  castDeliver(lastSnapshot);
}

// In Armenian, `ո` followed by `ւ` reads as the digraph `ու` and is shown in
// one slot. Build one slot per visible character, merging `ո+ւ` pairs.
function buildSlots(answer) {
  const slots = [];
  for (let i = 0; i < answer.length; i++) {
    if (answer[i + 1] === 'ւ') {
      slots.push({ char: 'ու', revealed: false });
      i++;
    } else {
      slots.push({ char: answer[i], revealed: false });
    }
  }
  return slots;
}

async function loadWords() {
  if (state.words) return state.words;
  const r = await fetch('assets/words.json');
  state.words = await r.json();
  return state.words;
}

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) {
    s.classList.toggle('active', s.id === id);
  }
}

// History-aware navigation. The initial document load is treated as the
// "menu" base state (history.state === null). Going to any sub-screen
// pushes one entry on top so that Android's back gesture pops back to
// the menu. Transitions between sub-screens (game <-> lose) replace the
// top entry instead of stacking, so back always lands on the menu in
// one step.
function pushScreen(screen) {
  const current = history.state && history.state.screen;
  if (current && current !== 'menu') {
    history.replaceState({ screen }, '');
  } else {
    history.pushState({ screen }, '');
  }
  showScreen(screen);
}

function goToMenu() {
  castSend('idle');
  const current = history.state && history.state.screen;
  if (current && current !== 'menu') {
    // Let the back navigation drive the screen change via popstate,
    // so the history depth stays consistent with what the user sees.
    history.back();
  } else {
    showScreen('menu');
    renderMenuHighScores();
  }
}

function getHighScore(mode) {
  const v = localStorage.getItem('hs_' + mode);
  return v == null ? 0 : parseInt(v, 10) || 0;
}
function setHighScore(mode, score) {
  if (score > getHighScore(mode)) {
    localStorage.setItem('hs_' + mode, String(score));
    return true;
  }
  return false;
}
function renderMenuHighScores() {
  for (const span of document.querySelectorAll('.hs')) {
    const hs = getHighScore(span.dataset.hs);
    span.textContent = hs > 0 ? `Ռեկորդ: ${hs}` : '';
  }
}

// Per-word stats: one JSON blob in localStorage with the full attempt
// history for every word the user has encountered. Used to render the
// stats screen with progress-over-time sparklines.
const STATS_KEY = 'hangmanStats_v1';

function readStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; }
  catch { return {}; }
}
function writeStats(obj) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(obj)); }
  catch (e) { console.warn('stats write failed', e); }
}
function recordAttempt(word, outcome, wrong) {
  if (!word) return;
  const all = readStats();
  const entry = all[word.a] || (all[word.a] = { clue: word.q, slots: buildSlots(word.a).length, attempts: [] });
  entry.clue = word.q;
  entry.slots = buildSlots(word.a).length;
  entry.attempts.push({ t: Date.now(), outcome, wrong });
  writeStats(all);
}

async function startGame(mode) {
  await loadWords();
  state.mode = mode;
  state.maxSkips = SKIPS_BY_MODE[mode];
  state.skipsUsed = 0;
  state.score = 0;
  state.picker = (mode === 'learning')
    ? new window.LearningPicker(state.words, readStats())
    : new window.ShufflePicker(state.words);
  document.getElementById('score').textContent = 'Հաշիվ: 0';
  buildKeyboard();
  buildSkipArrows();
  pushScreen('game');
  nextWord();
}

function buildKeyboard() {
  const kb = document.getElementById('keyboard');
  kb.innerHTML = '';
  for (const row of KEYBOARD) {
    const r = document.createElement('div');
    r.className = 'kbd-row';
    for (const letter of row) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'key';
      b.textContent = letter;
      b.dataset.letter = letter;
      b.addEventListener('click', () => onLetter(letter, b));
      r.appendChild(b);
    }
    kb.appendChild(r);
  }
}

function buildSkipArrows() {
  const c = document.getElementById('skipContainer');
  c.innerHTML = '';
  for (let i = 0; i < state.maxSkips; i++) {
    const a = document.createElement('div');
    a.className = 'skip-arrow';
    c.appendChild(a);
  }
  c.onclick = onSkip;
}

function resetKeyboard() {
  for (const k of document.querySelectorAll('.key')) {
    k.disabled = false;
    k.classList.remove('wrong');
  }
}

function renderSlots(extraClass = '') {
  const c = document.getElementById('letters');
  c.innerHTML = '';
  for (const slot of state.slots) {
    const d = document.createElement('div');
    d.className = 'letter-slot' + (extraClass ? ' ' + extraClass : '');
    if (slot.revealed) d.textContent = slot.char;
    c.appendChild(d);
  }
}

function setPersonImage() {
  document.getElementById('personImg').src = `assets/sm_${state.lives}.png`;
}

function nextWord() {
  state.lives = MAX_LIVES;
  state.locked = false;
  state.current = state.picker.pickNext(Date.now());
  state.slots = buildSlots(state.current.a);
  document.getElementById('clue').textContent = state.current.q;
  setPersonImage();
  resetKeyboard();
  renderSlots();
  castSend('playing');
}

function onSkip() {
  if (state.locked) return;
  if (state.skipsUsed >= state.maxSkips) return;
  const arrows = document.querySelectorAll('.skip-arrow');
  if (arrows[state.skipsUsed]) arrows[state.skipsUsed].classList.add('used');
  state.skipsUsed++;
  const wrong = MAX_LIVES - state.lives;
  recordAttempt(state.current, 'skipped', wrong);
  state.picker.afterRound(state.current, 'skipped', wrong);
  nextWord();
}

function onLetter(letter, btn) {
  if (state.locked || btn.disabled) return;
  btn.disabled = true;

  let found = false;
  for (const slot of state.slots) {
    if (slot.revealed) continue;
    if (slot.char === letter) {
      slot.revealed = true;
      found = true;
    }
  }

  if (!found) {
    btn.classList.add('wrong');
    state.lives--;
    setPersonImage();
    if (state.lives <= 0) {
      state.locked = true;
      for (const slot of state.slots) slot.revealed = true;
      renderSlots('wrong');
      recordAttempt(state.current, 'lost', MAX_LIVES);
      state.picker.afterRound(state.current, 'lost', MAX_LIVES);
      castSend('dead');
      setTimeout(loseGame, LOSE_PAUSE_MS);
      return;
    }
  }

  renderSlots();

  if (state.slots.every((s) => s.revealed)) {
    state.locked = true;
    state.score++;
    document.getElementById('score').textContent = `Հաշիվ: ${state.score}`;
    renderSlots('correct');
    const wrong = MAX_LIVES - state.lives;
    recordAttempt(state.current, 'solved', wrong);
    state.picker.afterRound(state.current, 'solved', wrong);
    castSend('solved');
    setTimeout(nextWord, REVEAL_PAUSE_MS);
  } else {
    castSend('playing');
  }
}

function loseGame() {
  // Guard: if the user pressed back during the 1.5s reveal-before-lose
  // pause, we're no longer on the game screen and shouldn't flip the UI
  // to the lose dialog.
  if (!document.getElementById('game').classList.contains('active')) return;
  const isHigh = setHighScore(state.mode, state.score);
  document.getElementById('loseImg').src = isHigh ? 'assets/happymarduk.png' : 'assets/sm_0.png';
  document.getElementById('loseScore').textContent = state.score;
  document.getElementById('loseHigh').textContent = isHigh ? 'Նոր ռեկորդ!' : '';
  pushScreen('lose');
  castSend('idle');
}

// Stats screen — list every encountered word with a small inline sparkline
// showing the wrong-guesses-per-slot ratio across its attempt history.
// Weakest words bubble to the top so the user knows what to practice.
const SPARK_W = 84;
const SPARK_H = 36;
const SPARK_PAD = 4;
const RATIO_CLAMP = 1.5;

// Single source of truth for per-attempt performance, in [0, 1].
// Solved attempts always score above unsolved ones -- a barely-solved
// attempt still scores 0.6, comfortably above any loss (0.1) or skip
// (0.0). Used by the per-word sparklines, the overall learning curve,
// the mastery chip, and the "best-known first" sort, so all four views
// agree on what "doing well" means.
function attemptPerformance(att, slots) {
  if (att.outcome === 'solved') {
    const ratio = att.wrong / slots;
    return 0.6 + 0.4 * (1 - Math.min(ratio, RATIO_CLAMP) / RATIO_CLAMP);
  }
  if (att.outcome === 'lost') return 0.1;
  return 0.0; // skipped
}

// Trailing-window mean of attemptPerformance. Mastery is read off the
// last MASTERY_WINDOW attempts only, not lifetime -- otherwise old losses
// would drag a word's avgPerf down forever even after the user got good
// at it. Sized to 3 by simulation: median ~4 attempts to first land in
// "strong" once the user starts solving cleanly, with ~20% inter-attempt
// class flicker (one in five attempts shifts the chip colour), which the
// picker's freshness/decay terms absorb. Both the stats screen and the
// learning picker call this.
const MASTERY_WINDOW = 3;
function avgPerfRecent(entry) {
  if (!entry || !entry.attempts || entry.attempts.length === 0) return null;
  const window = entry.attempts.slice(-MASTERY_WINDOW);
  return window.reduce((s, a) => s + attemptPerformance(a, entry.slots), 0) / window.length;
}

function entryStats(entry) {
  const solves = entry.attempts.filter((a) => a.outcome === 'solved');
  const losses = entry.attempts.filter((a) => a.outcome === 'lost');
  const skips = entry.attempts.filter((a) => a.outcome === 'skipped');
  const solveRate = entry.attempts.length ? solves.length / entry.attempts.length : 0;
  const avgWrong = solves.length ? solves.reduce((s, a) => s + a.wrong, 0) / solves.length : null;
  const avgRatio = solves.length ? avgWrong / entry.slots : null;
  const avgPerf = avgPerfRecent(entry);
  return { solves, losses, skips, solveRate, avgWrong, avgRatio, avgPerf };
}

function weakness(entry) {
  if (!entry.attempts.length) return -Infinity;
  const s = entryStats(entry);
  if (s.solves.length === 0) return Infinity; // never solved -> sort to one end
  return 1 - s.avgPerf;
}

function masteryClass(avgPerf) {
  if (avgPerf == null) return 'unknown';
  if (avgPerf >= 0.85) return 'strong';
  if (avgPerf >= 0.55) return 'medium';
  return 'weak';
}

function sparklineSvg(entry) {
  const a = entry.attempts;
  const innerW = SPARK_W - SPARK_PAD * 2;
  const innerH = SPARK_H - SPARK_PAD * 2;
  // X position for the i-th attempt out of N (centers when N=1).
  const xFor = (i) => a.length === 1
    ? SPARK_W / 2
    : SPARK_PAD + (i / (a.length - 1)) * innerW;

  // Y position from performance score (1.0 = top, 0.0 = bottom edge).
  // With the unified formula, solved attempts always fall in the upper
  // 40% of the chart, losses sit ~10% from the bottom, skips sit at the
  // bottom -- so the line touches the bottom only when the user actually
  // gave up.
  const yForPerf = (perf) =>
    SPARK_PAD + (1 - Math.max(0, Math.min(1, perf))) * innerH;
  const yForAttempt = (att) => yForPerf(attemptPerformance(att, entry.slots));

  // Connecting line through every attempt in chronological order, so a
  // failed or skipped attempt shows up as a dip in the trajectory rather
  // than being jumped over. Neutral grey -- the coloured markers below
  // carry the outcome semantics.
  // Marker palette is Okabe-Ito CB-safe:
  //   solved = blue       #0072B2
  //   lost   = vermillion #D55E00
  //   skipped = grey hollow circle
  const path = a.map((att, i) => {
    const x = xFor(i);
    const y = yForAttempt(att);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const polyline = a.length >= 2
    ? `<path d="${path}" stroke="#555" stroke-width="1.2" fill="none" opacity="0.45"/>`
    : '';

  // Markers per attempt.
  const markers = a.map((att, i) => {
    const x = xFor(i);
    const y = yForAttempt(att);
    if (att.outcome === 'solved') {
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#0072B2"/>`;
    }
    if (att.outcome === 'lost') {
      return `<rect x="${(x - 2.5).toFixed(1)}" y="${(y - 2.5).toFixed(1)}" width="5" height="5" fill="#D55E00"/>`;
    }
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="none" stroke="#888" stroke-width="1.2"/>`;
  }).join('');

  // Faint top + bottom guide lines so a lone marker has visual context.
  const guides =
    `<line x1="${SPARK_PAD}" y1="${SPARK_PAD}" x2="${SPARK_W - SPARK_PAD}" y2="${SPARK_PAD}" stroke="#0002" stroke-width="0.5"/>` +
    `<line x1="${SPARK_PAD}" y1="${SPARK_H - SPARK_PAD}" x2="${SPARK_W - SPARK_PAD}" y2="${SPARK_H - SPARK_PAD}" stroke="#0002" stroke-width="0.5"/>`;

  return `<svg class="spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" width="${SPARK_W}" height="${SPARK_H}" aria-hidden="true">${guides}${polyline}${markers}</svg>`;
}

// Overall learning curve — a small line chart at the top of the stats
// screen showing the rolling-10 average performance across every attempt
// the user has ever made, sorted chronologically. Each attempt's
// performance is normalised in [0, 1]: 1 = perfect solve (0 wrong), 0 =
// lost or skipped (gave up).
const LC_W = 300;
const LC_H = 110;
const LC_PAD = 6;

// Smooth the per-attempt performance with a rolling average whose window
// grows with how many attempts the user has. ~N/20 strikes a balance
// between responsiveness and noise: light enough at 50 attempts (window
// floors at 10), heavy enough at 1500+ attempts to actually flatten the
// raw zig-zag. Floor and cap keep both extremes sensible.
function learningCurveWindow(n) {
  return Math.max(10, Math.min(200, Math.round(n / 20)));
}

function allAttemptsChronological(statsObj) {
  const out = [];
  for (const entry of Object.values(statsObj)) {
    for (const att of entry.attempts) {
      out.push({ t: att.t, outcome: att.outcome, wrong: att.wrong, slots: entry.slots });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function performanceOf(att) {
  // Thin wrapper over the shared formula; the learning curve's attempt
  // objects already carry slots on themselves (set in
  // allAttemptsChronological).
  return attemptPerformance(att, att.slots);
}

function rollingAverage(values, window) {
  const out = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    const count = Math.min(i + 1, window);
    out[i] = sum / count;
  }
  return out;
}

function learningCurveHtml(statsObj) {
  const attempts = allAttemptsChronological(statsObj);
  if (attempts.length < 5) return '';
  const perfs = attempts.map(performanceOf);
  const window = learningCurveWindow(attempts.length);
  const avgs = rollingAverage(perfs, window);
  const innerW = LC_W - LC_PAD * 2;
  const innerH = LC_H - LC_PAD * 2;
  const xFor = (i) => LC_PAD + (i / (attempts.length - 1)) * innerW;
  const yFor = (p) => LC_PAD + (1 - Math.max(0, Math.min(1, p))) * innerH;

  // Horizontal guides. Top/bottom mark the [0, 1] range; the dashed
  // mid-line sits at 0.6 -- the solve floor -- so above the dash means
  // "mostly solving" and below means "mostly losing/skipping".
  const guides =
    `<line x1="${LC_PAD}" y1="${yFor(0).toFixed(1)}" x2="${LC_W - LC_PAD}" y2="${yFor(0).toFixed(1)}" stroke="#0002" stroke-width="0.6"/>` +
    `<line x1="${LC_PAD}" y1="${yFor(0.6).toFixed(1)}" x2="${LC_W - LC_PAD}" y2="${yFor(0.6).toFixed(1)}" stroke="#0002" stroke-width="0.5" stroke-dasharray="2 3"/>` +
    `<line x1="${LC_PAD}" y1="${yFor(1).toFixed(1)}" x2="${LC_W - LC_PAD}" y2="${yFor(1).toFixed(1)}" stroke="#0002" stroke-width="0.6"/>`;

  // Rolling-average line. The per-attempt dot layer was dropped here: at
  // 1000+ attempts those dots are visual noise -- the smoothed line is
  // the signal we actually care about.
  const line = avgs.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p).toFixed(1)}`
  ).join(' ');

  const current = avgs[avgs.length - 1];
  const pct = Math.round(current * 100);

  return (
    `<div class="stats-curve">` +
      `<div class="stats-curve-header">` +
        `<span>Ընդհանուր առաջընթաց</span>` +
        `<span class="stats-curve-pct">${pct}%</span>` +
      `</div>` +
      `<svg class="learning-curve" viewBox="0 0 ${LC_W} ${LC_H}" preserveAspectRatio="none" aria-hidden="true">` +
        guides +
        `<path d="${line}" stroke="#0072B2" stroke-width="2" fill="none"/>` +
      `</svg>` +
      `<div class="stats-curve-foot">${attempts.length} փորձ · վերջին ${window}-ի միջինը</div>` +
    `</div>`
  );
}

function renderStats() {
  const list = document.getElementById('statsList');
  const empty = document.getElementById('statsEmpty');
  const all = readStats();
  const entries = Object.entries(all);

  if (entries.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // Best-known first. Lowest weakness sorts to the top; never-solved words
  // (weakness = Infinity) end up at the bottom.
  entries.sort(([, A], [, B]) => {
    const wa = weakness(A);
    const wb = weakness(B);
    if (wa !== wb) return wa - wb;
    return B.attempts.length - A.attempts.length;
  });

  const curveHtml = learningCurveHtml(all);

  list.innerHTML = curveHtml + entries.map(([answer, entry]) => {
    const s = entryStats(entry);
    const cls = masteryClass(s.avgPerf);
    const avgWrongStr = s.avgWrong == null ? '—' : s.avgWrong.toFixed(1);
    const summary =
      `${entry.attempts.length} փորձ · ` +
      `միջ. ${avgWrongStr} · ` +
      `${s.skips.length} բացթ.`;
    return (
      `<div class="stats-row">` +
        `<div class="stats-text">` +
          `<div class="stats-answer">${answer}<span class="stats-chip ${cls}"></span></div>` +
          `<div class="stats-clue">${entry.clue}</div>` +
          `<div class="stats-summary">${summary}</div>` +
        `</div>` +
        sparklineSvg(entry) +
      `</div>`
    );
  }).join('');
}

// Screenshot capture: render the live DOM into an SVG <foreignObject>, draw
// it to a canvas, get a PNG blob. CSS and image references must be inlined
// as data URIs because the SVG-as-image rasterizer can't make fetches.
async function urlToDataUri(url) {
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  const blob = await r.blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function inlineCssUrls(cssText) {
  const urls = new Set();
  cssText.replace(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g, (_, u) => { urls.add(u); return _; });
  const entries = await Promise.all([...urls].map(async (u) => {
    if (u.startsWith('data:')) return [u, u];
    try {
      return [u, await urlToDataUri(new URL(u, location.href).href)];
    } catch {
      return [u, null];
    }
  }));
  const map = new Map(entries);
  return cssText.replace(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g,
    (m, u) => map.get(u) ? `url(${map.get(u)})` : m);
}

async function collectAllCss() {
  const parts = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) parts.push(rule.cssText);
    } catch { /* CORS-blocked sheet, skip */ }
  }
  return inlineCssUrls(parts.join('\n'));
}

async function inlineImageSrcs(root) {
  const imgs = root.querySelectorAll('img');
  await Promise.all([...imgs].map(async (img) => {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) return;
    try {
      img.setAttribute('src', await urlToDataUri(new URL(src, location.href).href));
    } catch { /* leave as-is */ }
  }));
}

async function captureScreenshotBlob() {
  const body = document.body;
  const rect = body.getBoundingClientRect();
  const w = Math.max(1, Math.ceil(rect.width));
  const h = Math.max(1, Math.ceil(rect.height));
  const dpr = window.devicePixelRatio || 1;

  // 1. Clone the DOM. Drop the screenshot button and anything that doesn't
  //    belong in the rasterized image (scripts/links/meta etc — they confuse
  //    strict XML parsers inside <foreignObject> on some mobile browsers).
  const bodyClone = body.cloneNode(true);
  const cloneShotBtn = bodyClone.querySelector('#shotBtn');
  if (cloneShotBtn) cloneShotBtn.remove();
  bodyClone.querySelectorAll('script, link, meta, noscript').forEach((n) => n.remove());
  await inlineImageSrcs(bodyClone);

  // 2. Inline every stylesheet rule + every url(...) inside them.
  const css = await collectAllCss();

  // 3. Move body's children into a plain <div xmlns="...xhtml"> wrapper.
  //    A <body> element inside <foreignObject> is technically allowed but
  //    flaky on mobile Safari / older Chrome; a <div> is the common pattern.
  //
  //    Catch: `body { ... }` rules in the inlined CSS don't match a <div>,
  //    so the body's background texture and font-family wouldn't apply.
  //    Copy those onto the wrapper inline, with the background-image URL
  //    resolved to a data URI (the SVG rasterizer can't fetch).
  const bodyComputed = getComputedStyle(body);
  let bgImageCss = '';
  const bgMatch = bodyComputed.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
  if (bgMatch) {
    try {
      const bgDataUri = await urlToDataUri(bgMatch[1]);
      bgImageCss =
        `background-image:url('${bgDataUri}');` +
        `background-repeat:${bodyComputed.backgroundRepeat};`;
    } catch { /* fall back to solid background-color only */ }
  }

  const wrapper = document.createElement('div');
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  wrapper.style.cssText =
    `width:${w}px;height:${h}px;display:flex;flex-direction:column;` +
    `overflow:hidden;margin:0;padding:0;` +
    `color:${bodyComputed.color};` +
    `font-family:${bodyComputed.fontFamily};` +
    `background-color:${bodyComputed.backgroundColor};` +
    bgImageCss;
  while (bodyClone.firstChild) wrapper.appendChild(bodyClone.firstChild);

  const wrapperXml = new XMLSerializer().serializeToString(wrapper);
  // Wrap CSS in CDATA in case any rule contains characters that XML would
  // otherwise interpret (e.g. `&` in a font-family fallback).
  const styleEl =
    `<style xmlns="http://www.w3.org/1999/xhtml"><![CDATA[${css}]]></style>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<foreignObject width="100%" height="100%">` +
        styleEl +
        wrapperXml +
      `</foreignObject>` +
    `</svg>`;

  // 4. Rasterize: SVG -> Image -> Canvas -> PNG blob. Use a data: URL
  //    instead of a blob URL — mobile rasterizers (especially iOS Safari
  //    and older Android WebView) sometimes reject blob URLs for SVG-as-image
  //    but accept data URLs of the same content.
  const svgUrl =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('SVG image failed to load (foreignObject content may be malformed or too large)'));
    i.src = svgUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.drawImage(img, 0, 0);

  return await new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('canvas.toBlob returned null (canvas may be tainted)'));
      }, 'image/png');
    } catch (e) {
      // toBlob throws SecurityError on a tainted canvas in some browsers.
      reject(new Error('canvas.toBlob threw: ' + (e.message || e.name)));
    }
  });
}

// Deliver the blob via the best available channel:
//   1. navigator.clipboard.write([ClipboardItem]) -- ideal, lands in paste buffer.
//   2. navigator.share({files}) -- Android/iOS share sheet.
//   3. <a download> -- always works, saves a file.
async function deliverScreenshot(blob) {
  if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Պատճենվեց');
      return;
    } catch (e) {
      console.warn('clipboard.write failed', e);
    }
  }
  if (navigator.canShare && navigator.share) {
    const file = new File([blob], 'hangman.png', { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // user dismissed
        console.warn('navigator.share failed', e);
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hangman.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Ներբեռնվեց');
}

function toast(message) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('fade'), 1300);
  setTimeout(() => t.remove(), 1800);
}

document.addEventListener('DOMContentLoaded', () => {
  renderMenuHighScores();
  for (const btn of document.querySelectorAll('.menu-btn[data-mode]')) {
    btn.addEventListener('click', () => startGame(btn.dataset.mode));
  }
  document.getElementById('playAgainBtn').addEventListener('click', () => startGame(state.mode));
  document.getElementById('menuBtn').addEventListener('click', () => goToMenu());
  document.getElementById('statsLink').addEventListener('click', () => {
    renderStats();
    pushScreen('stats');
  });
  document.getElementById('statsBackBtn').addEventListener('click', () => goToMenu());

  // Intercept the system back gesture (Android back button or browser back).
  // Without this, back from any sub-screen would exit the PWA instead of
  // returning to the menu.
  window.addEventListener('popstate', (e) => {
    const target = (e.state && e.state.screen) || 'menu';
    if (target === 'menu') renderMenuHighScores();
    if (target === 'stats') renderStats();
    showScreen(target);
  });
  document.getElementById('shotBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const blob = await captureScreenshotBlob();
      await deliverScreenshot(blob);
    } catch (err) {
      console.error('screenshot failed', err);
      const detail = (err && (err.message || err.name)) || 'unknown';
      toast('Չհաջողվեց: ' + detail);
    } finally {
      btn.disabled = false;
    }
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
