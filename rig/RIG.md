# Marduk rig

A runtime animation rig for the Marduk mascot. `createRig()` builds a transform
hierarchy over the flat semantic SVG (`assets/marduk_semantic.svg`) and exposes
**normalized params** you drive from 0..1 / −1..1. Two independent layers compose:

- **SHAPE** — blend-shape morphs of the eyes / brows / mouth (expression, blink,
  emotions, modifier versions).
- **TRANSFORM** — gaze / head-turn / breath / body-lean, plus every modifier add.

Because they are separate, blink + wink + gaze + head-turn + expression + a
modifier all stack without fighting.

> Spline-bone limb deformation (fingers, arm) is a separate engine — see
> **[BONES.md](BONES.md)**.

---

## Quick start

```js
const svg = /* the inlined <svg> from assets/marduk_semantic.svg */;
const rig = createRig(svg, faceTargets, modifiers);   // faceTargets=face_targets.json, modifiers=modifiers.json (optional)

rig.p.expr = -1;        // sad
rig.p.gazeX = 0.5;      // look right
rig.idle(true);         // procedural life: breath, blinks, gaze wander
rig.blink();            // one-shot blink
rig.lookAt(0.9, 0.3);   // glance somewhere, hold, then idle resumes
rig.p.girl = 1;         // apply a modifier (0..1, fades in)
```

`createRig` mutates the SVG in place (rebuilds `#win` into `rig-body > rig-head`
groups) and starts its own `requestAnimationFrame` loop. It expects the semantic
SVG's ids: `win` / `lose` states, `win-head`, `win-torso`, `win-bars`,
`win-hands-l/-r`, and the `win-eyes/brows/mouth` layers (removed and redrawn from
`face_targets.json`).

---

## Params — `rig.p`

Set any of these live; the rAF loop applies them next frame.

| Param | Range | Meaning |
|---|---|---|
| `expr` | −1..1 | Expression valence: 1 happy · 0 neutral · −1 sad |
| `surprise` | 0..1 | Overlay emotion (see grab matrix) |
| `thoughtful` | 0..1 | Overlay emotion |
| `confused` | 0..1 | Overlay emotion |
| `gazeX`, `gazeY` | −1..1 | Look direction (2.5D head-turn on the head sphere) |
| `headX`, `headY` | −1..1 | Head position offset (translate) |
| `headTilt` | −1..1 | Head roll |
| `eyeOpenL`, `eyeOpenR` | 0..1 | Per-eye open amount (1 open, 0 shut) — blink/wink drive these |
| `breath` | 0..1 | Breath phase (0.5 rest); drives torso expand, bob, necklace |
| `bodyLean` | −1..1 | Whole-body lean about the feet |
| `hands` | `'neutral'` \| `'thumbsup'` | Hand-pose swap |
| `clown`, `king`, `nerd`, `girl`, `sailor`, `police`, `clock` | 0..1 | Modifier levels (fade the modifier in) |

Emotions are **combinatorial**: `expr` sets the happy↔sad base, and each overlay
(`surprise`/`thoughtful`/`confused`) composes on top — you can be sad *and*
surprised at once.

---

## Config — `rig.cfg`

Tunable constants (edit live in the tuner, then export). Amplitudes:

| Key | Default | Meaning |
|---|---|---|
| `headX`, `headY` | 22, 16 | px travel at `p.headX/Y = ±1` |
| `headTilt` | 7 | deg roll at `±1` |
| `gazeYaw`, `gazePitch` | 38, 26 | deg head-turn at gaze `±1` |
| `constrainEye` | 0 | eye/brow sphere latitude constraint (0 = free swing to silhouette, 1 = true sphere) |
| `constrainMouth` | 1 | mouth sphere constraint |
| `browDrop` | 3 | px the brow rides down as the eye shuts |
| `breathScale`, `breathBob` | 0.02, 3 | head vertical breath scale / bob px |
| `torsoExpand` | 0.14 | horizontal torso inflate on inhale |
| `lean` | 6 | deg body lean at `bodyLean = ±1` |
| `snoutZ` | 190 | horse muzzle plate depth (parallax) |
| `earClip` | 0.3 | `gazeX` past which a receding-side earring hard-clips away |
| `neckBreath` | 0.22 | how much the necklace bead-curve stretches/sags with breath |
| `grab` | *(matrix)* | emotion × part ownership, below |

### The grab matrix — `cfg.grab[emotion][part]`

Overlay emotions share face parts with the base expression. Per part
(`mouth`/`eye`/`brow`) the weight `g` says how the emotion claims it:

- **`g = 1` — OWN**: blend the base shape *toward* this emotion's shape (the
  emotion wins the part).
- **`g = 0` — SHARE**: add this emotion's *displacement* on top of the base
  (both read at once).

```
grab = {
  surprise:   { mouth:1, eye:1,   brow:0   },   // owns mouth+eyes, shares brows
  thoughtful: { mouth:1, eye:0.5, brow:1   },
  confused:   { mouth:1, eye:0.5, brow:1   },
}
```

So "sad + surprised" keeps the sad brows (surprise shares them) while surprise
fully takes the round eyes and open mouth.

---

## API — `createRig()` return

| Member | What |
|---|---|
| `p` | live params object (above) |
| `cfg` | live config object (above) |
| `flush()` | apply `p` to the DOM once (the rAF loop calls it; call it yourself for headless/static renders) |
| `blink(D=200)` | one-shot blink over `D` ms |
| `wink(side='l', D=260)` | one-shot wink (`'l'`/`'r'`) |
| `idle(on)` | toggle procedural life: breath sine, random blinks, gaze wander |
| `lookAt(gx, gy, hold=700)` | snap-focus the gaze to a direction, hold `hold` ms, then idle wander resumes |
| `headC`, `Rx`, `Ry` | head sphere centre + radii (win-local coords) |
| `pivots` | `{neck, feet, belly}` geometry pivots |
| `stop()` | cancel the rAF loop |

---

## Gaze / head-turn model

The head is treated as a **sphere**; each face feature reprojects on it for a
2.5D turn (translate + foreshorten). `gazeX/Y` become yaw/pitch (`cfg.gazeYaw/
gazePitch`). `constrainEye/Mouth` set the latitude constraint: `0` lets a feature
swing all the way to the silhouette, `1` keeps it on its true circle-of-latitude.
Head *position* (`headX/Y`, `headTilt`, breath bob) is a separate translate/rotate
on the whole head group.

---

## Modifiers

A modifier ADDS features (drawn + animated) and/or OVERRIDES face parts, faded in
by its level param (`rig.p.<name>` 0..1). Data lives in **`modifiers.json`**,
built from an annotated tracing. Built-in: **clown, king, nerd, girl, sailor,
police, clock**. **horse** is frozen research in `generated/horse_modifier.json`
(see the tube gazes below).

A modifier entry = `{ adds:{…}, versions:{…}, facefx:{…}, eyefx:{…}, hide:[…],
headMorph:{…} }`. A quick tour of the built-ins:

- **clown** — nose/lipstick/makeup adds + versions replacing eyes/brows/mouth.
- **king** — crown (with a white occluder under the features) + mustache; eyes/brows generic.
- **nerd** — glasses on a parallax plane + eyefx (eyes shrink behind the lenses).
- **girl** — earrings, breathing beaded necklace, lashed-eye version.
- **sailor** — outline cap (occluder under the features) + anchor + hair + mirrored ears.
- **police** — solid cap assembled by `stack` (white base + black detail) + badge star.
- **clock** — turns the head into a real-time clock: `headMorph` (egg→round rim),
  numbers/ticks/hands (real-time `hand` gaze), flat-disc gaze, `facefx` eyes+mouth,
  brows hidden. See *Clock: the flat-disc modifier* below.
- **executioner** — a solid black hood covering the whole head (`cover`), with the
  head morphed to tuck inside it, brows/mouth hidden, and the base eyes drawn white
  on top (`maskEyes`) so they read as eye-holes that still emote.
- **farmer** — a straw hat (occluder-cut) + a wheat straw in the mouth corner
  (`stick` gaze: rides the live mouth corner, flips side-opposite the gaze, sways
  with the breath) with its own occluder that cuts everything but the mouth.

### `adds` — extra features

Each add is one drawn feature with a **gaze style** telling it how to follow the
head. Value is either a gaze string or `{gaze, …opts}`:

| gaze | behaviour | used by |
|---|---|---|
| `eye` | reproject on the head sphere (eye constraint) | clown nose/makeup |
| `mouth` | reproject on the head sphere (mouth constraint) | clown lipstick, king mustache |
| `none` | ride the head rigidly (no reproject) | king crown, horse ears/hair |
| `plane` | rigid plane at depth `z` in front of the face — parallax (leads the face on turns) | nerd glasses |
| `ear` | anchor rides the sphere as a **translate only** (no foreshorten); the receding-side copy hard-clips away past `cfg.earClip` | girl earrings |
| `body` | parented to the **torso** group, not the head (stays put on head-turn; leans/breathes with the body) | girl necklace |
| `tube-front` | rigid plate at `cfg.snoutZ` sticking out of the head (big parallax) | horse muzzle |
| `tube-trunk` | stretch-bridge: base rides the sphere, tip follows the muzzle plate | horse snout trunk |
| `hand` | rotates around a `center` pivot to the **real current time** (`role: 'hour'\|'minute'`; drawn angle measured at build) | clock hands |
| `stick` | a rigid mouth prop: base tracks the live mouth corner, flips to the side opposite the gaze (sticky ±1), sways with the breath; drawn in front of the face behind the mouth, its `occ` occluder cuts the face-core (all but the mouth) | farmer straw |

Add options (in the `{…}` form):

- `labels:[…]` — merge several traced layers into one add (e.g. earring stud + bead).
- `dy` — vertical nudge (folded into the reproject).
- `z` — plane depth for `gaze:'plane'`.
- `below:true` — draw under the face features (occluder; e.g. king crown white plate).
- `fill` — override ink colour.
- `clip` — per-add override of `cfg.earClip` (the `gaze:'ear'` hide threshold).
- `earY` — scale a `gaze:'ear'` add's vertical motion (full X ride, reduced Y).
- `mirror:'<add>'` — this add is another add **reflected across the head centre**
  (sailor's left ear from the right); reuses its paths in a reflect group.
- `occHead:true` — for an occluder+front add, route the white occluder **under**
  the features (occlude the head only, keep brows) while the ink stays on top;
  both zoom in together. Sailor/king caps.
- `stack:[[label,fill],…]` — ordered raw parts drawn back-to-front with explicit
  fills (police cap: white base occluder + black line-art).
- `raw:true` — keep raw geometry (evenodd detail) instead of re-tracing to one outline.
- `fade:true` — reveal by opacity crossfade instead of the zoom-from-nothing.
- `cover:true` — a solid shape (no white occluder) that cuts the head by its **own**
  silhouette and draws on top (executioner hood). Makes the modifier headwear.
- `beads:[…]` — a per-bead add: each label becomes its own group riding a curve
  fit through the bead centres (chord + per-bead sag), squash/stretched by breath
  (`cfg.neckBreath`). Girl necklace.
- **occluder + front** — if a source layer has a white (`fill:#ffffff`) path plus
  an ink path, both are kept: the white becomes an occluder, the ink is drawn on
  top. Auto-detected; no flattening. Girl jewelry / caps use this.

Every add **zooms in from nothing** on reveal, staggered, after the morph.

### Occlusion — cut, don't paint

The character is transparent line-art (no white fills), so painting white to
hide a line would leave a white patch on a textured game background. Instead the
rig treats **white occluders as *cuts***: their shapes go (as black) into an SVG
mask on `rig-head-content`, making the head transparent there so the background
shows through. Two groups under `rig-head`:

- **`rig-head-content`** *(masked)* — everything occludable: the head shape,
  face features, and on-face adds (clock numbers/ticks/hands, clown nose, …).
- **`rig-head-wear`** *(on top, unmasked)* — headwear ink (caps, crowns, ears).

A modifier is **headwear** if any of its adds carries a white occluder. Its rigid
(`none`/`ear`) inks then draw in `rig-head-wear` (above *other* modifiers'
content) and its occluders cut the content — so a police cap correctly hides the
clock's rim **and** numbers/hands beneath it, then draws on top. Cuts ride the
same transform as their add (caps static, ears follow + clip; a mirrored ear's
cut is reflected too) and fade in with the reveal. The mask sits on the static
content group, so the clock's `headMorph` can't drag the cuts out of alignment.

### `versions` — per-part shape overrides

`versions[baseSlot][expr] = 100-pt outline`. Blends the base part toward the
modifier's shape by the modifier level. Slots: `mouth`, `eye-l/-r`, `brow-l/-r`.
Clown re-shapes all; king only mouth; girl only the lashed eyes; nerd none.

### `hide` — remove a base part

`hide:['mouth']` fades a base slot out by the modifier level (horse hides the
base mouth). Brow slots are **zoomed to nothing** instead of faded (clock).

### `eyefx` / `facefx` — reposition + resize the base features (keep emotions)

Instead of *replacing* a feature (a `version`, which loses expressions), these
move + scale the base eye/mouth **keeping its shape**, so `expr`/overlays still
morph it. `eyefx[eye-l/r] = {c,s}` is nerd's X-only eye shrink. `facefx[eye-l/r/
mouth] = {c,s}` is full-2D and covers the mouth too (clock) — the clock is a
working dial that still emotes. Blink/emotions apply on top.

### `headMorph` — reshape the head

`headMorph:{c,rx,ry}` scales + shifts the brush head into a target circle by the
modifier level (clock: egg head → round rim; executioner: head shrunk to tuck
inside the hood). Per-modifier, so several can coexist. The head sphere geometry
(`headC/Rx/Ry`) comes from `win-head` only.

### `maskEyes` — white eyes on top

`maskEyes:true` draws the base eyes **white on top of the headwear** (executioner
hood), mirroring their exact shape/gaze/blink each frame — so they read as glowing
eye-holes that still emote, while the real eyes underneath are cut away by the hood.

### Clock: the flat-disc modifier

The clock stacks the pieces above: `headMorph` rounds the head, `facefx`
repositions the eyes+mouth onto the dial, `hide` zooms the brows away, numbers/
ticks/`center` are plain adds, and the two `gaze:'hand'` adds rotate to the real
time. When any modifier is on, the head can also switch from the **sphere** gaze
to a **flat-disc** gaze — features stop reprojecting and the whole head
foreshortens by `cos(yaw)/cos(pitch)`, tilting like a wall clock.

### Building a modifier (pipeline)

```
# 1. trace the ink PNG/JPEG into an annotatable SVG with empty target layers
python tools/trace_png.py generated/girl.jpeg generated/girl.svg l-earring,r-earring,necklace,head

# 2. — in Inkscape — drag each traced part into its layer; delete junk (cage/rays/hand);
#      keep face parts generic unless you want a version. Save.

# 3. build the alignment SVG (grey marduk reference + your parts at the canonical transform)
python tools/make_align_svg.py girl generated/girl.svg generated/girl_align.svg

# 4. — in Inkscape — nudge/scale the coloured group onto the marduk. Save.

# 5. add a CONFIG entry in tools/build_modifier_aligned.py, then build -> modifiers.json
python tools/build_modifier_aligned.py girl generated/girl_align.svg happy

# 6. add the level param: rig.p.<name> (rig.js) + a slider (rig_tuner.html)
```

Every generated PNG frames the character identically, so **one canonical
transform** aligns them all (hand-tuned once). Inspect where anything actually
renders with `python tools/svg_query.py <svg> <label…>` (real headless browser).

---

## Compatibility & suggestion

The game can stack several modifiers + emotions, so two systems tell it what
fits together and what to pick.

### Compatibility — which combos are valid

An **incompatibility list** of minimal forbidden token-sets. A requested set
(active modifier names + emotion tokens: `expression`/`surprise`/`thoughtful`/
`confused`) is compatible **iff no forbidden set is a subset of it**.

- `tools/build_compat.py` → `compatibility.json` — **auto-derives** the list from
  each modifier's slot claims (two modifiers sharing an exclusive slot —
  head/eyes/brows/mouth/ears/neck — clash) plus the grab matrix (a modifier that
  *locks* a face part clashes with an emotion that fully *owns* that part), then
  applies hand `ALLOW`/`ADD` tweaks. Re-run whenever a modifier changes.
- `compat.js` — `makeCompat(data)`:
  - `ok(active)` → true iff compatible
  - `conflicts(active)` → which forbidden sets fired (for UI/debug)
  - `allowedToAdd(active, candidates)` → which tokens can still be added

### Suggestion — pick a set from theme tags

- `tags.json` — per-character theme tags (`clock: ["time","hour",…]`), hand-authored
  (kept out of the generated `modifiers.json`).
- `suggest.js` — `makeSuggest(tags, compat)`:
  - `scores(input)` → ranked tag-overlap score per character
  - `pick(input, {max, minScore, seed})` → best set, ranked by score, ties broken
    by a **deterministic `seed`** (reproducible, but different seeds shuffle equal
    matches), then greedily kept **compatible** — always a valid combo.

The tuner shows a live **COMPATIBLE / INCOMPATIBLE** banner + the forbidden list
with the current conflicts highlighted.

---

## Cage bars — `bars_demo.html`

The hangman "cage" closing in as the player loses. **8 bars → 14 game steps**:
the first 2 bars drop fully (1 step each), the remaining 6 drop in **two half
steps** (`kAt(i, step)`). Each bar `k`: `1` = fully off-frame, `0` = at rest,
`0.5` = half in.

- **Drop feel** — sudden & sad: enters already moving fast (`V0=0.6`), accelerates
  under "gravity", then **hard-stops** on impact (no ease-out, no bounce).
  `drop(t)=V0·t+(1−V0)·t²`, `DUR_IN≈190ms`, with fall time ∝ √distance so a
  half-step falls proportionally quicker.
- **Reaction** — on each incoming bar the character `lookAt()`s it for ~0.8s then
  resumes idle (`glanceAt`).
- **Expression follows the cage** — step 0 = happy (+1) … step 14 = sad (−1). On
  each change it snaps to the full reaction, then **eases off up to ~10%** back
  toward neutral over a randomized ~1.5–3s.
- `setStep(n, animate, stagger)`, `+/−` buttons, a scrubber, and **Cage all /
  Break free**. (The bars group is `id="cage-bars"` so it doesn't clash with the
  `<button id="cage">`.)

---

## Demos

| File | What |
|---|---|
| `rig_tuner.html` | **Main tuner** — every param, `cfg` ranges, the grab matrix, modifier sliders, blink/wink/hands/idle, export config JSON, and a live **compatibility panel** |
| `bars_demo.html` | Cage bars, 14 steps, with the reacting character |
| `blink_demo.html` | Blink/wink timing |
| `finger_demo.html` | Spline-bone finger curl (per-finger + "all") |
| `arm_demo.html`, `hand_arm_demo.html` | Spline-bone arm bend + parented hand |
| `brush_taper_demo.html` | Research: dissolve/brush-taper filter (on hold) |

---

## Tools & data

| | |
|---|---|
| `tools/trace_png.py` | ink PNG/JPEG → annotatable SVG (smooth beziers, empty target layers) |
| `tools/make_align_svg.py` | build the manual-alignment SVG at the canonical transform |
| `tools/build_modifier_aligned.py` | `CONFIG` + aligned SVG → `modifiers.json` |
| `tools/build_compat.py` | `modifiers.json` + grab matrix + tweaks → `compatibility.json` |
| `tools/build_face_targets.py` | build `face_targets.json` (eye/brow/mouth morph targets) |
| `tools/svg_query.py` | headless-browser: where does an element actually render? |
| `tools/bones.py`, `build_finger_bend.py`, `build_arm_bend.py` | spline-bone baking (see BONES.md) |
| `face_targets.json` | corresponded 100-pt outlines per part × key (neutral/happy/sad/surprised/shut) |
| `modifiers.json` | built modifiers (clown, king, nerd, girl, sailor, police, clock) |
| `compat.js` + `compatibility.json` | compatibility query helper + forbidden-set data |
| `suggest.js` + `tags.json` | tag-based character-set suggester + per-character tags |

**Deps:** `cairosvg pillow numpy scipy scikit-image` for the build tools;
`chromium` (headless) for `svg_query.py` and static renders.
