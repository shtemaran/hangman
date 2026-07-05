# Marduk semantic mascot

`marduk_semantic.svg` is the Marduk mascot as **one toggleable SVG** instead of a stack of
flat PNGs. It holds both game states — the caged "losing" figure and the escaped "winning"
figure — decomposed into named, independently controllable layers that share a single
coordinate space, so any feature can be revealed, hidden, or swapped between states.

Open `marduk_preview.html` (served over HTTP, e.g. `python3 -m http.server`) for a live
compositor: a progressive-reveal slider, a per-feature `lose / win / off` selector, and preset
buttons (Play / Win / Sad+smile / Happy+frown).

## Provenance

Reconstructed from the original designer sources in this folder:

- **Play state** ← `marduk_lose.svg`, aligned to the 15 progressive frames `sm_0.png … sm_14.png`
  (`sm_0` = fully drawn / lost, `sm_14` = blank). Each element was assigned the emptiest frame
  whose ink still contains it, giving its reveal step.
- **Win state** ← `happymarduk.svg`.

Both drawings were authored in the same `841.89 × 595.28` canvas, so they share coordinates
natively; duplicate/near-duplicate brush paths were merged and elements were grouped into
semantic parts.

## Structure

```
<svg viewBox="167.98 77.99 493.94 425.95">   one shared coordinate space
  <g id="lose" data-state="lose">            play state (visible by default)
    <g id="lose-bars">   <path data-step="9" …/>   every lose path carries data-step
    <g id="lose-head"> <g id="lose-torso"> <g id="lose-mouth">
    <g id="lose-brows-l"> <g id="lose-brows-r">
    <g id="lose-eyes-l">  <g id="lose-eyes-r">
    <g id="lose-hands-l"> <g id="lose-hands-r">
  </g>
  <g id="win" data-state="win"
     transform="translate(-10.64 -26.60)"     registers happy's head onto the caged head
     style="display:none">
    <g id="win-bars"> … same semantic groups (win-head, win-mouth, win-brows-l, …)
  </g>
</svg>
```

`-l` / `-r` are the **viewer's** left / right (same convention as the eyes).

## How to drive it

Two independent axes of control:

**1. Progressive reveal (hangman).** Every `#lose` path has a `data-step` = the last frame it
appears in. To render frame `sm_k`, show paths whose step ≥ k:

```js
lose.querySelectorAll('[data-step]').forEach(p => {
  p.style.display = (+p.getAttribute('data-step') >= k) ? '' : 'none';
});
```

`k = 0` → full caged figure (lost); higher `k` → fewer strokes; `k = 14` → blank.

**2. State + feature swap.** Toggle whole semantic groups. Because both states are registered,
a feature from one grafts correctly onto the other (e.g. happy mouth on the sad face):

```js
function setSource(slot, src){            // slot: 'mouth', 'eyes-l', 'hands-r', …  src: 'lose'|'win'|'off'
  document.getElementById('lose-'+slot).style.display = src==='lose' ? '' : 'none';
  document.getElementById('win-'+slot ).style.display = src==='win'  ? '' : 'none';
}
```

Show all `lose-*` for Play, all `win-*` for Win, or mix per slot. (The `#win` wrapper ships
`display:none`; a runtime that composites per-slot should clear that and let the slot groups
decide visibility.)

## Slots

`bars`, `head`, `torso`, `mouth`, `brows-l`, `brows-r`, `eyes-l`, `eyes-r`, `hands-l`, `hands-r`
— present in both `lose-*` and `win-*`.
