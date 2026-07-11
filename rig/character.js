// rig/character.js — reusable Marduk character controller.
//
// Mounts the rig + cage into a host element and reacts to game-state snapshots
// (the same shape app.js publishes to Chromecast). Shared by the phone
// (character.js) and the TV receiver (receiver.html): both feed it identical
// snapshots from different sources, so the two stay in lockstep for free.
//
//   const ch = createCharacter(hostEl);
//   ch.onState(snapshot);          // call on every snapshot
//
// Read-only: it observes state and never calls back into the game.
function createCharacter(host) {
  const MAX_LIVES = 14;                 // must match app.js
  let rig = null, cage = null;
  let mounted = false, mounting = false;
  let running = false;                  // whether idle life should be on
  let pendingStep = 0;                  // step to apply once the rig is mounted
  let suggest = null;                   // tag -> character-set picker (once mounted)
  let lastSeed = null, pendingTags = [], pendingSeed = 0;
  const ALL_MODS = ['clown', 'king', 'nerd', 'girl', 'sailor', 'police', 'clock', 'executioner', 'farmer', 'painter'];
  const modTarget = {};                 // modifier -> target level (0/1); fades toward it
  let modRaf = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // A 60fps-tuned lerp factor made frame-rate-independent, so smoothing runs at
  // the same speed on 60/90/120Hz screens.
  const smoothK = (f, dt) => 1 - Math.pow(1 - f, dt * 60);
  let exprPrev = 0, modPrev = 0;                 // per-loop last-frame timestamps

  // A word's theme tags pick a compatible SET of modifiers (repeatable per word
  // via the seed). Fade the chosen ones in and the rest out.
  function applyCharacter(tags, seed) {
    if (!suggest) return;
    const chosen = new Set(suggest.pick(tags || [], { max: 3, seed }).map((x) => x.mod));
    for (const m of ALL_MODS) modTarget[m] = chosen.has(m) ? 1 : 0;
    if (modRaf == null) { modPrev = 0; modRaf = requestAnimationFrame(modLoop); }
  }
  function modLoop() {
    if (!rig) { modRaf = null; return; }
    const now = performance.now();
    const dt = modPrev ? Math.min((now - modPrev) / 1000, 0.05) : 0; modPrev = now;
    const k = smoothK(0.1, dt);
    let moving = false;
    for (const m of ALL_MODS) {
      const cur = rig.p[m] || 0, tgt = modTarget[m] || 0;
      if (Math.abs(tgt - cur) > 0.004) { rig.p[m] = cur + (tgt - cur) * k; moving = true; }
      else rig.p[m] = tgt;
    }
    modRaf = moving ? requestAnimationFrame(modLoop) : null;
  }

  // Expression follows the cage: step 0 = happy (+1) ... last step = sad (-1).
  // On each change snap to the full reaction, then ease a few % back toward
  // neutral over a randomized ~1.5-3s. Driven off the cage's onStep hook.
  let exprRaf = null, reactT = 1, relaxT = 1, relaxStart = 0, relaxEnd = 0;
  function reactToStep(step, total) {
    const np = 1 - (step / total) * 2;                     // full reaction for this step
    reactT = np; relaxT = np * (1 - (0.05 + Math.random() * 0.05));  // settle 5-10% back
    const now = performance.now();
    relaxStart = now + 400;                                // hold a beat, then relax
    relaxEnd = relaxStart + (1500 + Math.random() * 1500);
    if (exprRaf == null) { exprPrev = 0; exprRaf = requestAnimationFrame(exprLoop); }
  }
  function exprLoop() {
    if (!rig) { exprRaf = null; return; }
    const now = performance.now();
    const dt = exprPrev ? Math.min((now - exprPrev) / 1000, 0.05) : 0; exprPrev = now;
    let target = reactT;
    if (now >= relaxStart) {
      const u = clamp((now - relaxStart) / (relaxEnd - relaxStart), 0, 1);
      target = reactT + (relaxT - reactT) * (u * u * (3 - 2 * u));   // smoothstep relax
    }
    rig.p.expr += (target - rig.p.expr) * smoothK(0.12, dt);
    if (now < relaxEnd || Math.abs(target - rig.p.expr) > 0.002) exprRaf = requestAnimationFrame(exprLoop);
    else { rig.p.expr = target; exprRaf = null; }
  }

  async function mount() {
    if (mounted || mounting || !host) return;
    mounting = true;
    try {
      const [svgText, targets, mods, tagsData, compatData] = await Promise.all([
        fetch('assets/marduk_semantic.svg').then((r) => r.text()),
        fetch('rig/face_targets.json').then((r) => r.json()),
        fetch('rig/modifiers.json').then((r) => r.json()),
        fetch('rig/tags.json').then((r) => r.json()),
        fetch('rig/compatibility.json').then((r) => r.json()),
      ]);
      host.innerHTML = svgText;
      const svg = host.querySelector('svg');
      rig = window.createRig(svg, targets, mods);
      cage = window.createCage(svg, rig, { onStep: reactToStep });
      suggest = window.makeSuggest(tagsData, window.makeCompat(compatData));
      mounted = true;
      rig.idle(running);
      cage.setStep(pendingStep, false);   // place bars for the current step, no animation
      applyCharacter(pendingTags, pendingSeed);
    } catch (e) {
      console.warn('character mount failed', e);
    } finally {
      mounting = false;
    }
  }

  function resume() {
    running = true;
    if (rig) rig.idle(true);
    if (!mounted) mount();                 // lazy: first time we enter play
  }
  function pause() {
    running = false;
    if (rig) rig.idle(false);              // keep the SVG mounted for an instant resume
  }

  // Pause off the game screen; otherwise track the cage to how many lives are
  // gone. setStep is bidirectional, so a new word (lives back to full -> step 0)
  // simply breaks the cage open.
  function onState(s) {
    if (!s) return;
    if (s.phase === 'idle') { pause(); return; }
    resume();
    const step = Math.max(0, MAX_LIVES - (typeof s.lives === 'number' ? s.lives : MAX_LIVES));
    if (mounted) cage.setStep(step, true);
    else pendingStep = step;               // mount() will place it when ready
    if (s.seed !== lastSeed) {              // new word -> re-pick the character set
      lastSeed = s.seed; pendingSeed = s.seed || 0; pendingTags = s.tags || [];
      if (mounted) applyCharacter(pendingTags, pendingSeed);
    }
  }

  return { onState, pause, resume };
}

if (typeof module !== 'undefined') module.exports = { createCharacter };
