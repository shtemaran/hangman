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

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
    if (exprRaf == null) exprRaf = requestAnimationFrame(exprLoop);
  }
  function exprLoop() {
    if (!rig) { exprRaf = null; return; }
    const now = performance.now(); let target = reactT;
    if (now >= relaxStart) {
      const u = clamp((now - relaxStart) / (relaxEnd - relaxStart), 0, 1);
      target = reactT + (relaxT - reactT) * (u * u * (3 - 2 * u));   // smoothstep relax
    }
    rig.p.expr += (target - rig.p.expr) * 0.12;
    if (now < relaxEnd || Math.abs(target - rig.p.expr) > 0.002) exprRaf = requestAnimationFrame(exprLoop);
    else { rig.p.expr = target; exprRaf = null; }
  }

  async function mount() {
    if (mounted || mounting || !host) return;
    mounting = true;
    try {
      const [svgText, targets] = await Promise.all([
        fetch('assets/marduk_semantic.svg').then((r) => r.text()),
        fetch('rig/face_targets.json').then((r) => r.json()),
      ]);
      host.innerHTML = svgText;
      const svg = host.querySelector('svg');
      rig = window.createRig(svg, targets);
      cage = window.createCage(svg, rig, { onStep: reactToStep });
      mounted = true;
      rig.idle(running);
      cage.setStep(pendingStep, false);   // place bars for the current step, no animation
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
  }

  return { onState, pause, resume };
}

if (typeof module !== 'undefined') module.exports = { createCharacter };
