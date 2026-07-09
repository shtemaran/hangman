// character.js — the Marduk character as a read-only OBSERVER of game state.
//
// Separation of concerns: the game (app.js) publishes a state snapshot on every
// move via window.subscribeGameState; the character subscribes and reacts. It
// never calls back into the game, so it can't affect play. The same snapshot
// stream already drives Chromecast, which makes porting the rig to the TV later
// straightforward.
//
// This bridge only mounts the rig + cage and maps the snapshot's `lives` onto
// the cage step. Expression / win-lose morphs come later.
(function () {
  const MAX_LIVES = 14;                 // must match app.js
  const host = () => document.getElementById('person');

  let rig = null, cage = null;
  let mounted = false, mounting = false;
  let running = false;                  // whether idle life should be on
  let pendingStep = 0;                  // step to apply once the rig is mounted

  async function mount() {
    if (mounted || mounting || !host()) return;
    mounting = true;
    try {
      const [svgText, targets] = await Promise.all([
        fetch('assets/marduk_semantic.svg').then((r) => r.text()),
        fetch('rig/face_targets.json').then((r) => r.json()),
      ]);
      const el = host(); if (!el) return;
      el.innerHTML = svgText;
      const svg = el.querySelector('svg');
      rig = window.createRig(svg, targets);
      cage = window.createCage(svg, rig);
      mounted = true;
      rig.idle(running);
      cage.setStep(pendingStep, false); // place bars for the current step, no animation
    } catch (e) {
      console.warn('character mount failed', e);
    } finally {
      mounting = false;
    }
  }

  function resume() {
    running = true;
    if (rig) rig.idle(true);
    if (!mounted) mount();              // lazy: first time we enter play
  }
  function pause() {
    running = false;
    if (rig) rig.idle(false);           // keeps the SVG mounted for an instant resume
  }

  // The whole reaction: pause off the game screen; otherwise track the cage to
  // how many lives are gone. `setStep` is bidirectional, so a new word (lives
  // back to full -> step 0) simply breaks the cage open.
  function onState(s) {
    if (!s) return;
    if (s.phase === 'idle') { pause(); return; }
    resume();
    const step = Math.max(0, MAX_LIVES - (typeof s.lives === 'number' ? s.lives : MAX_LIVES));
    if (mounted) cage.setStep(step, true);
    else pendingStep = step;            // mount() will place it when ready
  }

  if (window.subscribeGameState) window.subscribeGameState(onState);
})();
