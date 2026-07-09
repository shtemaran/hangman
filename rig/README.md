# Marduk rig workspace

Animation rig around `assets/marduk_semantic.svg` — a JS runtime (`rig.js`) that
drives the mascot's expression, gaze, breath, blink, scripted actions, and a
data-driven **modifier** system (clown / king / nerd / girl / sailor / police /
clock), plus the hangman **cage bars**. A **compatibility** system knows which
modifiers/emotions stack, and a **suggester** picks a character set from theme
tags. Limbs (fingers/arm) bend along spline bones.

## Docs
- **[RIG.md](RIG.md)** — the rig: params, config, API, gaze model, the full
  modifier system + build pipeline, compatibility + suggestion, the cage bars,
  and all the demos. **Start here.**
- **[BONES.md](BONES.md)** — the spline-bone deformation engine (finger curl, arm).

## Try it
Open in a browser (served locally):
- `rig_tuner.html` — tune every param / modifier live, export the config.
- `bars_demo.html` — the cage closing in over 14 steps, character reacting.
- `finger_demo.html`, `arm_demo.html`, `hand_arm_demo.html` — spline-bone limbs.

## Layout
- `rig.js` — the runtime rig (source of truth) · `bones.js` — spline-bone engine
- `compat.js` + `suggest.js` — compatibility query + tag suggester (game-facing)
- `face_targets.json`, `modifiers.json`, `compatibility.json`, `tags.json`, `*_bend.json` — baked data
- `tools/` — trace / align / build scripts (see RIG.md → *Building a modifier*)
- `generated/` — source ink images + traced/aligned SVGs · `out/`, `traces/` — scratch

## Deps
`cairosvg pillow numpy scipy scikit-image` for the build tools; headless
`chromium` for `tools/svg_query.py` and static renders.
