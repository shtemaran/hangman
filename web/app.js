// Armenian keyboard layout. Last row has 9 keys; the 10th cell is left empty
// so columns line up with the 10-key rows above.
const KEYBOARD = [
  ['է', 'թ', 'փ', 'ձ', 'ջ', 'և', 'ր', 'չ', 'ճ', 'ժ'],
  ['ք', 'ո', 'ե', 'ռ', 'տ', 'ը', 'ու', 'ի', 'օ', 'պ'],
  ['ա', 'ս', 'դ', 'ֆ', 'գ', 'հ', 'յ', 'կ', 'լ', 'շ'],
  ['զ', 'ղ', 'ց', 'վ', 'բ', 'ն', 'մ', 'խ', 'ծ'],
];

const SKIPS_BY_MODE = { easy: 4, medium: 2, hard: 0 };
const MAX_LIVES = 14;
const REVEAL_PAUSE_MS = 800;
const LOSE_PAUSE_MS = 1500;

const state = {
  mode: null,
  words: null,
  questions: [],
  index: -1,
  current: null,
  slots: [],
  lives: MAX_LIVES,
  score: 0,
  skipsUsed: 0,
  maxSkips: 0,
  locked: false,
};

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

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

async function startGame(mode) {
  await loadWords();
  state.mode = mode;
  state.maxSkips = SKIPS_BY_MODE[mode];
  state.skipsUsed = 0;
  state.score = 0;
  state.questions = shuffle(state.words);
  state.index = -1;
  document.getElementById('score').textContent = 'Հաշիվ: 0';
  buildKeyboard();
  buildSkipArrows();
  showScreen('game');
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
  state.index++;
  if (state.index >= state.questions.length) {
    state.questions = shuffle(state.words);
    state.index = 0;
  }
  state.current = state.questions[state.index];
  state.slots = buildSlots(state.current.a);
  document.getElementById('clue').textContent = state.current.q;
  setPersonImage();
  resetKeyboard();
  renderSlots();
}

function onSkip() {
  if (state.locked) return;
  if (state.skipsUsed >= state.maxSkips) return;
  const arrows = document.querySelectorAll('.skip-arrow');
  if (arrows[state.skipsUsed]) arrows[state.skipsUsed].classList.add('used');
  state.skipsUsed++;
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
    setTimeout(nextWord, REVEAL_PAUSE_MS);
  }
}

function loseGame() {
  const isHigh = setHighScore(state.mode, state.score);
  document.getElementById('loseImg').src = isHigh ? 'assets/happymarduk.png' : 'assets/sm_0.png';
  document.getElementById('loseScore').textContent = state.score;
  document.getElementById('loseHigh').textContent = isHigh ? 'Նոր ռեկորդ!' : '';
  showScreen('lose');
}

document.addEventListener('DOMContentLoaded', () => {
  renderMenuHighScores();
  for (const btn of document.querySelectorAll('.menu-btn[data-mode]')) {
    btn.addEventListener('click', () => startGame(btn.dataset.mode));
  }
  document.getElementById('playAgainBtn').addEventListener('click', () => startGame(state.mode));
  document.getElementById('menuBtn').addEventListener('click', () => {
    renderMenuHighScores();
    showScreen('menu');
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
