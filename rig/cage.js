// cage.js — the hangman "cage" bars as a reusable rig feature.
//
// Clones the semantic SVG's #lose-bars into individually-animated bars and maps
// a 0..TOTAL step onto them: bars drop in as the step rises (the player losing)
// and retract as it falls. The character glances at each incoming bar. An
// optional `opts.onStep(step, total)` lets a caller react (e.g. drive
// expression) without this module knowing anything about it.
//
//   const cage = createCage(svg, rig);
//   cage.setStep(3, true);          // animate to step 3
//
// Requires the SVG to be attached to the DOM and visible (uses getBBox).
// Extracted from bars_demo.html so the game and the demo share one cage.
function createCage(svg, rig, opts) {
  opts = opts || {};
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeIn = (t) => t * t * t;                       // removal accelerates away
  // drop-in: enters already moving fast, accelerates under "gravity", then HARD
  // STOPS on impact — no ease-out, no bounce.
  const V0 = 0.6, drop = (t) => V0 * t + (1 - V0) * t * t;
  const DUR_IN = 190, DUR_OUT = 320;
  const [VX, VY, VW, VH] = svg.getAttribute('viewBox').split(' ').map(Number), M = 40;

  // Head centre in viewBox coords, for glancing at a dropping bar.
  const wm = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(
    (svg.querySelector('#win').getAttribute('transform')) || '');
  const winT = wm ? [+wm[1], +wm[2]] : [0, 0];
  const headCvb = [rig.headC[0] + winT[0], rig.headC[1] + winT[1]];
  const glanceAt = (b) => {
    const cx = b.bb.x + b.bb.width / 2, cy = b.bb.y + b.bb.height / 2;
    rig.lookAt((cx - headCvb[0]) / (VW * 0.30), (cy - headCvb[1]) / (VH * 0.30), 800);
  };

  // Clone each cage bar into its own group. k: 1 = fully off-frame, 0 = at rest,
  // 0.5 = half in. (id must not clash with any `#cage` element elsewhere.)
  const src = svg.querySelector('#lose-bars');
  const cageG = document.createElementNS(NS, 'g'); cageG.id = 'cage-bars'; svg.appendChild(cageG);

  // Clip the bars to the viewBox. SVG doesn't clip to its viewBox by default, so
  // on a wide screen (letterboxed) an off-frame bar would otherwise show in the
  // side margins. Clipping hides bars until they slide into frame.
  const defs = svg.querySelector('defs') ||
    svg.insertBefore(document.createElementNS(NS, 'defs'), svg.firstChild);
  const clip = document.createElementNS(NS, 'clipPath'); clip.id = 'cage-clip';
  const cr = document.createElementNS(NS, 'rect');
  cr.setAttribute('x', VX); cr.setAttribute('y', VY);
  cr.setAttribute('width', VW); cr.setAttribute('height', VH);
  clip.appendChild(cr); defs.appendChild(clip);
  cageG.setAttribute('clip-path', 'url(#cage-clip)');
  const bars = [...src.querySelectorAll('path,polygon')].map((el) => {
    const g = document.createElementNS(NS, 'g'); g.appendChild(el.cloneNode(true)); cageG.appendChild(g);
    const bb = g.getBBox(); return { g, bb, vert: bb.height > bb.width, k: 1, goal: 1 };
  });
  const Vb = bars.filter((b) => b.vert).sort((a, b) => a.bb.x - b.bb.x);
  const Hb = bars.filter((b) => !b.vert).sort((a, b) => a.bb.y - b.bb.y);
  Vb.forEach((b) => { b.sx = 0; b.sy = -(b.bb.y + b.bb.height - VY + M); });   // drop from above
  const dir = [-1, 1, 1, -1];                                                 // H bars slide off L,R,R,L
  Hb.forEach((b, i) => {
    const d = dir[i % 4]; b.sy = 0;
    b.sx = d > 0 ? (VX + VW - b.bb.x + M) : -(b.bb.x + b.bb.width - VX + M);
  });
  const order = [...Vb, ...Hb]; order.forEach((b, i) => (b.i = i));           // drop sequence
  const N = order.length, TOTAL = 2 + (N - 2) * 2;                           // 8 bars -> 14 steps
  const place = (b) => b.g.setAttribute('transform', `translate(${b.sx * b.k} ${b.sy * b.k})`);
  bars.forEach(place);

  // step -> per-bar target k. First 2 bars drop fully (1 step each); the rest
  // drop in two halves.
  function kAt(i, step) {
    if (i < 2) return step >= (i + 1) ? 0 : 1;
    const half = 3 + (i - 2) * 2, full = half + 1;
    return step >= full ? 0 : step >= half ? 0.5 : 1;
  }

  // Per-bar tween from current k to target k. Gravity feel: a shorter fall
  // (half-step) takes proportionally less time (dur ~ sqrt of distance).
  const anims = new Map(); let raf = null;
  function loop() {
    const now = performance.now();
    for (const [b, a] of anims) {
      const p = (now - a.t0) / a.dur; if (p < 0) continue;
      if (p >= 1) { b.k = a.to; place(b); anims.delete(b); continue; }
      const e = a.to < a.from ? drop(p) : easeIn(p);
      b.k = a.from + (a.to - a.from) * e; place(b);
    }
    raf = anims.size ? requestAnimationFrame(loop) : null;
  }
  const go = (b, to, delay) => {
    const dur = (to < b.k ? DUR_IN : DUR_OUT) * Math.sqrt(Math.max(Math.abs(to - b.k), 0.25));
    anims.set(b, { t0: performance.now() + (delay || 0), from: b.k, to, dur });
    if (raf == null) raf = requestAnimationFrame(loop);
  };

  function setStep(n, animate, stagger) {
    const step = clamp(Math.round(n), 0, TOTAL); let k = 0, dropped = null;
    for (const b of order) {
      const t = kAt(b.i, step);
      if (t === b.goal) continue;
      if (t < b.goal) dropped = b;                       // a bar coming in -> glance at it
      b.goal = t;
      if (animate) { go(b, t, k * (stagger || 0)); k++; } else { b.k = t; place(b); }
    }
    if (animate && dropped) glanceAt(dropped);
    if (opts.onStep) opts.onStep(step, TOTAL);
    return step;
  }

  setStep(0, false);
  return { setStep, TOTAL };
}

if (typeof module !== 'undefined') module.exports = { createCage };
