// Word pickers — drive what word the game serves next.
//
// `Picker` is the polymorphic interface; the game code in app.js holds a
// reference to one and just calls `pickNext(now)` and `afterRound(...)`,
// regardless of mode.
//
//   ShufflePicker   — Fisher-Yates uniform shuffle. Used by easy / medium /
//                     hard. Cycles through the full list once before
//                     reshuffling. afterRound is a no-op.
//   LearningPicker  — adaptive picker for the "Ուսում" mode. Scores every
//                     word by weakness + freshness + decay, with a
//                     same-session loopback queue for struggled words.
//                     Tuned via offline simulation against the user's
//                     attempt history (see /data/...).
//
// LearningPicker depends on two helpers from app.js — `attemptPerformance`
// and `buildSlots` — used at pick/afterRound time, never at construction,
// so load order between this file and app.js doesn't matter.

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Picker {
  /**
   * Choose the next word given the current epoch ms.
   * @returns {{q: string, a: string}}
   */
  pickNext(_now) {
    throw new Error('Picker.pickNext must be overridden');
  }

  /**
   * Notify the picker that a round ended with `outcome` and `wrong` guesses.
   * Default: no-op (suits ShufflePicker; LearningPicker overrides).
   */
  afterRound(_word, _outcome, _wrong) {}
}

class ShufflePicker extends Picker {
  constructor(words) {
    super();
    this.words = words;
    this.queue = shuffle(words);
    this.index = -1;
  }
  pickNext(_now) {
    this.index += 1;
    if (this.index >= this.queue.length) {
      this.queue = shuffle(this.words);
      this.index = 0;
    }
    return this.queue[this.index];
  }
}

// ─── Learning picker ──────────────────────────────────────────────────────

const LM_WEAKNESS_WEIGHT    = 2.5;
const LM_SCORE_FLOOR        = 1.0;
const LM_FRESHNESS_BONUS    = 1.5;
const LM_FRESHNESS_LO_H     = 6;
const LM_FRESHNESS_HI_H     = 24;
const LM_DECAY_START_H      = 48;
const LM_DECAY_PER_DAY      = 1.5;
const LM_DECAY_CAP_DAYS     = 5;
const LM_COLD_START_BONUS   = 4.0;
const LM_COOLDOWN_LEN       = 3;
const LM_LOOPBACK_MIN       = 4;
const LM_LOOPBACK_MAX       = 8;
const LM_STRUGGLE_THRESHOLD = 0.7;

class LearningPicker extends Picker {
  /**
   * @param {Array<{q:string, a:string}>} words - full word list to draw from
   * @param {Object} stats - snapshot of hangmanStats_v1; the picker mirrors
   *   round outcomes into it as the game progresses so subsequent scores
   *   see fresh data without re-reading localStorage.
   */
  constructor(words, stats) {
    super();
    this.words = words;
    this.stats = stats;
    this.byAnswer = new Map();
    for (const w of words) this.byAnswer.set(w.a, w);
    this.loopback = new Map();       // answer -> fireAtRound
    this.sessLoopbacked = new Set(); // answers already loopback'd this session
    this.recent = [];                // cool-down ring of last LM_COOLDOWN_LEN answers
    this.round = 0;
  }

  pickNext(now) {
    this.round += 1;

    // Phase 1: scheduled loopback fires (at most one per word per session).
    for (const [answer, fireAt] of this.loopback) {
      if (fireAt <= this.round && !this.recent.includes(answer)) {
        this.loopback.delete(answer);
        this.sessLoopbacked.add(answer);
        this._markRecent(answer);
        return this.byAnswer.get(answer);
      }
    }

    // Phase 2: priority-weighted sample over the full eligible pool. No
    // top-N cutoff -- strong words still get a non-zero chance via the
    // score floor and the decay bonus.
    const candidates = this.words.filter((w) => !this.recent.includes(w.a));
    const weights = candidates.map((w) => [w, this._score(w, now)]);
    const total = weights.reduce((s, [, sc]) => s + sc, 0);
    let r = Math.random() * total;
    for (const [w, sc] of weights) {
      r -= sc;
      if (r <= 0) {
        this._markRecent(w.a);
        return w;
      }
    }
    const fallback = weights[weights.length - 1][0];
    this._markRecent(fallback.a);
    return fallback;
  }

  afterRound(word, outcome, wrong) {
    const slots = window.buildSlots(word.a).length;

    // Mirror the attempt into the in-memory stats so the next pick scores
    // it as if localStorage had been updated. (recordAttempt() in app.js
    // also writes to localStorage — that's the long-term store.)
    let entry = this.stats[word.a];
    if (!entry) {
      entry = { clue: word.q, slots, attempts: [] };
      this.stats[word.a] = entry;
    }
    entry.clue = word.q;
    entry.slots = slots;
    entry.attempts.push({ t: Date.now(), outcome, wrong });

    // Maybe queue a loopback. At most one fire per word per session.
    if (this.sessLoopbacked.has(word.a) || this.loopback.has(word.a)) return;
    const perf = window.attemptPerformance({ outcome, wrong }, slots);
    if (perf < LM_STRUGGLE_THRESHOLD) {
      const span = LM_LOOPBACK_MAX - LM_LOOPBACK_MIN + 1;
      const fireAt = this.round + LM_LOOPBACK_MIN + Math.floor(Math.random() * span);
      this.loopback.set(word.a, fireAt);
    }
  }

  // ── private ──────────────────────────────────────────────────────────

  _score(word, now) {
    const entry = this.stats[word.a];
    let avgPerf, lastSeenT, hasSolve;
    if (entry && entry.attempts.length) {
      const slots = entry.slots;
      avgPerf = entry.attempts.reduce(
        (s, a) => s + window.attemptPerformance(a, slots), 0
      ) / entry.attempts.length;
      lastSeenT = entry.attempts[entry.attempts.length - 1].t;
      hasSolve = entry.attempts.some((a) => a.outcome === 'solved');
    } else {
      avgPerf = 0.5;
      lastSeenT = null;
      hasSolve = false;
    }
    const hours = lastSeenT == null ? Infinity : (now - lastSeenT) / 3600000;
    const weakness = 1 - avgPerf;

    let s = LM_SCORE_FLOOR + LM_WEAKNESS_WEIGHT * weakness;
    if (hours >= LM_FRESHNESS_LO_H && hours <= LM_FRESHNESS_HI_H) {
      s += LM_FRESHNESS_BONUS;
    }
    if (hours > LM_DECAY_START_H) {
      const daysPast = (hours - LM_DECAY_START_H) / 24;
      s += Math.min(daysPast, LM_DECAY_CAP_DAYS) * LM_DECAY_PER_DAY;
    }
    if (!hasSolve) s += LM_COLD_START_BONUS;
    return s;
  }

  _markRecent(answer) {
    this.recent.push(answer);
    if (this.recent.length > LM_COOLDOWN_LEN) this.recent.shift();
  }
}

// Expose the classes on window so app.js can instantiate them.
window.ShufflePicker = ShufflePicker;
window.LearningPicker = LearningPicker;
